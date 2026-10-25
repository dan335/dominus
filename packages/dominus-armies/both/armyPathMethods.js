var coordinatesError = function() {
  return new ValidationError([
    {
      name: 'coordinate',
      type: 'X and Y must be integers.',
      details: {}
    }
  ]);
};

// check max number of paths
var checkNumPaths = function(numPaths) {
  if (numPaths > _s.armies.maxPaths) {
    throw new ValidationError([
      {
        name: 'maxPaths',
        type: 'At move limit. ' + _s.armies.maxPaths + ' moves max.',
        details: {}
      }
    ]);
  }
};

// make sure this isnt' a duplicate of last one
// also get last index
var nextPathIndex = function(lastPath, x, y) {
  if (lastPath) {

    if (lastPath.x == x && lastPath.y == y) {
      throw new ValidationError([
        {
          name: 'armies.addPath',
          type: 'Duplicate destination.',
          details: {}
        }
      ]);
    }

    return lastPath.index+1;
  } else {
    return 0;
  }
};

var newPath = function(gameId, x, y, index, armyId, userId) {
  return {
    gameId:gameId,
    x:x,
    y:y,
    index:index,
    armyId:armyId,
    user_id:userId,
    createdAt:dClock.now(),
    paused:false,     // used to pause army movement
    countryIds:null,  // array of country ids to use in pathfinding
    hexes:null,        // path for army to follow
    distance:null,    // filled in later
    time:null,        // filled in later
    speed:null,        // filled in later
    dirtyMoveTotals:false
  };
};

var clearRoute = {time:null, distance:null, hexes:null, countryIds:null};

// The writes that reorder an army's paths, as a list of
// {find, modifier, multi}. The simulation makes them one by one and the
// server as one ordered bulk op, so both end the same.
var applyPathWrites = function(writes) {
  writes.forEach(function(w) {
    Armypaths.update(w.find, w.modifier, {multi:w.multi});
  });
};

var applyPathWritesAsync = async function(writes) {
  if (!writes.length) {
    return;
  }
  var bulk = Armypaths.rawCollection().initializeOrderedBulkOp();
  writes.forEach(function(w) {
    if (w.multi) {
      bulk.find(w.find).update(w.modifier);
    } else {
      bulk.find(w.find).updateOne(w.modifier);
    }
  });
  try {
    await bulk.execute();
  } catch (error) {
    console.error(error);
  }
};

// re-number the paths left after one is removed. When the first path was
// removed, a path without its own last_move_at takes the army's:
// armyLastMoveAt(p) returns {value} for it, or null to leave it out (the
// server reads it from the army, the simulation doesn't)
var removePathWrites = function(path, rest, armyLastMoveAt) {
  var writes = [];
  var index = 0;
  rest.forEach(function(p) {
    var set = {index:index};

    if (path.index == 0) {
      if (p.last_move_at) {
        set.last_move_at = p.last_move_at;
      } else {
        var lastMoveAt = armyLastMoveAt(p);
        if (lastMoveAt) {
          set.last_move_at = lastMoveAt.value;
        }
      }
    }

    // re-pathfind path before and after
    if (index == path.index - 1 || index == path.index) {
      set.hexes = null;
      set.countryIds = null;
      set.distance = null;
      set.time = null;
    }

    writes.push({find:{_id:p._id}, modifier:{$set:set}, multi:false});

    index++;
  });
  return writes;
};

// swap a path with the one before it; last_move_at is the first path's when
// this one becomes first
var decreasePathWrites = function(path, userId, last_move_at) {
  // move path down
  var findThis = {index:path.index, user_id:userId, armyId:path.armyId};
  var set = {last_move_at:last_move_at, index:path.index-1};

  // move other path up
  var findOther = {_id:{$ne:path._id}, index:path.index-1, user_id:userId, armyId:path.armyId};

  // re-path
  let indexes = _.range(path.index-3, path.index+2);
  let findPath = {user_id:userId, armyId:path.armyId, index: {$in:indexes}};

  return [
    {find:findThis, modifier:{$set:set}, multi:false},
    {find:findOther, modifier:{$set:{index:path.index}}, multi:false},
    {find:findPath, modifier:{$set:clearRoute}, multi:true},
  ];
};

// swap a path with the one after it
var increasePathWrites = function(path, userId) {
  // move this path up
  var find = {index:path.index, user_id:userId, armyId:path.armyId};

  // move other path down
  var find2 = {_id:{$ne:path._id}, index:path.index+1, user_id:userId, armyId:path.armyId};

  // re-path
  let indexes = _.range(path.index-2, path.index+3);
  let find3 = {user_id:userId, armyId:path.armyId, index: {$in:indexes}};

  return [
    {find:find, modifier:{$set:{index:path.index+1}}, multi:false},
    {find:find2, modifier:{$set:{index:path.index, last_move_at:path.last_move_at}}, multi:true},
    {find:find3, modifier:{$set:clearRoute}, multi:true},
  ];
};


Meteor.methods({
  addArmyPath: function(gameId, x, y, armyId) {
    check(x, Number);
    check(y, Number);
    var self = this;
    check(armyId, String);
    check(gameId, String);

    if (!self.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in.');
    }

    // check x,y
    if (!dFunc.isInt(x) || !dFunc.isInt(y)) {
      throw coordinatesError();
    }

    var find = {armyId:armyId, user_id:self.userId};

    if (self.isSimulation) {
      checkNumPaths(Armypaths.find(find).count());
      var index = nextPathIndex(Armypaths.findOne(find, {sort:{index:-1}}), x, y);
      // the server adds the army's speed and last_move_at
      return Armypaths.insert(newPath(gameId, x, y, index, armyId, self.userId));
    }

    return (async () => {
      // only the owner may move an army -- the move jobs look paths up by armyId
      // only, so a path added to someone else's army would move it
      var army = await Armies.findOneAsync({_id:armyId, gameId:gameId, user_id:self.userId}, {fields: {last_move_at:1, speed:1}});
      if (!army) {
        throw new Meteor.Error('not-authorized', 'You do not own this army.');
      }

      checkNumPaths(await Armypaths.find(find).countAsync());
      var index = nextPathIndex(await Armypaths.findOneAsync(find, {sort:{index:-1}}), x, y);

      // make sure hex exists
      if (!await Hexes.find({gameId:gameId, x:x, y:y}).countAsync()) {
        throw new ValidationError([
          {
            name: 'armies.addPath',
            type: 'Hex does not exist.',
            details: {}
          }
        ]);
      }

      var path = newPath(gameId, x, y, index, armyId, self.userId);

      // path always gets army speed
      // reset last_move_at when aremy moves, is created or add index 0 path
      path.last_move_at = army.last_move_at;
      path.speed = army.speed;

      return await Armypaths.insertAsync(path);
    })();
  },




  removeArmyPath: function(pathId) {
    var self = this;
    check(pathId, String);

    if (!self.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in.');
    }

    // get armyId and index
    var find = {user_id:this.userId, _id:pathId};
    var options = {sort:{index:1}};

    if (self.isSimulation) {
      var path = Armypaths.findOne(find);
      if (path) {
        Armypaths.remove({_id:pathId, user_id:self.userId});

        // reorder
        var rest = Armypaths.find({armyId:path.armyId, user_id:self.userId}, options).fetch();
        applyPathWrites(removePathWrites(path, rest, function() { return null; }));
      }
      return;
    }

    return (async () => {
      var path = await Armypaths.findOneAsync(find);
      if (path) {
        var armyId = path.armyId;
        await Armypaths.removeAsync({_id:pathId, user_id:self.userId});

        // reorder
        var rest = await Armypaths.find({armyId:armyId, user_id:self.userId}, options).fetchAsync();

        // get last_move_at from army, for each path that needs it, as before
        var armyLastMoveAt = {};
        for (const p of rest) {
          if (path.index == 0 && !p.last_move_at) {
            var armyFind = {_id:armyId};
            var army = await Armies.findOneAsync(armyFind, {fields:{last_move_at:1}});
            if (army) {
              armyLastMoveAt[p._id] = {value:army.last_move_at};
            } else {
              console.error('no army found in removeArmyPath', armyFind);
            }
          }
        }

        await applyPathWritesAsync(removePathWrites(path, rest, function(p) {
          return armyLastMoveAt[p._id] || null;
        }));
      }
    })();
  },




  decreasePathIndex: function(pathId) {
    var self = this;
    check(pathId, String);

    if (!self.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in.');
    }

    var pathFind = {_id:pathId, user_id:self.userId};
    var fields = {last_move_at:1};
    var otherFind = function(path) {
      return {user_id:self.userId, armyId:path.armyId, index:path.index-1};
    };

    if (self.isSimulation) {
      // get path
      var path = Armypaths.findOne(pathFind);
      if (!path) {
        throw new Meteor.Error('no path found in decreasePathIndex');
      }

      // abort if this is first path
      if (path.index == 0) {
        return;
      }

      // if this is now first path figure out last_move_at time
      var last_move_at = null;
      if (path.index == 1) {
        var otherPath = Armypaths.findOne(otherFind(path), {fields:fields});
        if (!otherPath) {
          console.error('no otherPath found in decreasePathIndex');
          return false;
        }
        last_move_at = otherPath.last_move_at;
      }

      applyPathWrites(decreasePathWrites(path, self.userId, last_move_at));
      return;
    }

    return (async () => {
      // get path
      var path = await Armypaths.findOneAsync(pathFind);
      if (!path) {
        throw new Meteor.Error('no path found in decreasePathIndex');
      }

      // abort if this is first path
      if (path.index == 0) {
        return;
      }

      // if this is now first path figure out last_move_at time
      var last_move_at = null;
      if (path.index == 1) {
        var otherPath = await Armypaths.findOneAsync(otherFind(path), {fields:fields});
        if (!otherPath) {
          console.error('no otherPath found in decreasePathIndex');
          return false;
        }
        last_move_at = otherPath.last_move_at;
      }

      await applyPathWritesAsync(decreasePathWrites(path, self.userId, last_move_at));
    })();
  },




  increasePathIndex: function(pathId) {
    var self = this;
    check(pathId, String);

    if (!self.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in.');
    }

    var pathFind = {_id:pathId, user_id:self.userId};
    var lastFind = function(path) {
      return {armyId:path.armyId, user_id:self.userId};
    };

    if (self.isSimulation) {
      // get path
      var path = Armypaths.findOne(pathFind);
      if (!path) {
        throw new Meteor.Error('no path found in increasePathIndex');
      }

      // get path with highest index, last path
      var lastPath = Armypaths.findOne(lastFind(path), {sort:{index:-1}});
      if (!lastPath) {
        throw new Meteor.Error('no lastpath found in increasePathIndex');
      }

      // if this is already last path abort
      if (lastPath._id == path._id) {
        return;
      }

      applyPathWrites(increasePathWrites(path, self.userId));
      return;
    }

    return (async () => {
      // get path
      var path = await Armypaths.findOneAsync(pathFind);
      if (!path) {
        throw new Meteor.Error('no path found in increasePathIndex');
      }

      // get path with highest index, last path
      var lastPath = await Armypaths.findOneAsync(lastFind(path), {sort:{index:-1}});
      if (!lastPath) {
        throw new Meteor.Error('no lastpath found in increasePathIndex');
      }

      // if this is already last path abort
      if (lastPath._id == path._id) {
        return;
      }

      await applyPathWritesAsync(increasePathWrites(path, self.userId));
    })();
  },



  pauseMovement: function(armyId) {
    check(armyId, String);
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in.');
    }
    var find = {armyId:armyId, user_id:this.userId};
    var options = {$set: {paused:true}};
    if (this.isSimulation) {
      Armypaths.update(find, options, {multi:true});
      return;
    }
    return (async () => {
      await Armypaths.updateAsync(find, options, {multi:true});
    })();
  },

  resumeMovement: function(armyId) {
    check(armyId, String);
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in.');
    }
    var find = {armyId:armyId, user_id:this.userId};
    var options = {$set: {paused:false}};
    if (this.isSimulation) {
      Armypaths.update(find, options, {multi:true});
      return;
    }
    return (async () => {
      await Armypaths.updateAsync(find, options, {multi:true});
    })();
  },
})



if (Meteor.isServer) {
  var resumeMovementRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'resumeMovement'
  }
  DDPRateLimiter.addRule(resumeMovementRule, 6, 5000);

  var pauseMovementRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'pauseMovement'
  }
  DDPRateLimiter.addRule(pauseMovementRule, 6, 5000);

  var addArmyPathRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'addArmyPath'
  }
  DDPRateLimiter.addRule(addArmyPathRule, 6, 3000);

  var increasePathIndexRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'increasePathIndex'
  }
  DDPRateLimiter.addRule(increasePathIndexRule, 6, 5000);

  var decreasePathIndexRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'decreasePathIndex'
  }
  DDPRateLimiter.addRule(decreasePathIndexRule, 6, 5000);

  var removeArmyPathRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'removeArmyPath'
  }
  DDPRateLimiter.addRule(removeArmyPathRule, 20, 5000);
}
