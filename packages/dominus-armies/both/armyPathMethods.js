if (Meteor.isServer) {
  Future = Npm.require('fibers/future');
}

Meteor.methods({
  addArmyPath: function(gameId, x, y, armyId) {
    var self = this;
    check(armyId, String);
    check(gameId, String);

    // check x,y
    if (!dFunc.isInt(x) || !dFunc.isInt(y)) {
      throw new ValidationError([
        {
          name: 'coordinate',
          type: 'X and Y must be integers.',
          details: {}
        }
      ]);
    }

    // check max number of paths
    let numPaths = Armypaths.find({armyId:armyId, user_id:self.userId}).count();
    if (numPaths > _s.armies.maxPaths) {
      throw new ValidationError([
        {
          name: 'maxPaths',
          type: 'At move limit. ' + _s.armies.maxPaths + ' moves max.',
          details: {}
        }
      ]);
    }

    // make sure this isnt' a duplicate of last one
    // also get last index
    var index;
    var last_move_at = null;
    var find = {armyId:armyId, user_id:self.userId};
    var lastPath = Armypaths.findOne(find, {sort:{index:-1}});
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

      index = lastPath.index+1;
    } else {
      index = 0;
    }

    if (!self.isSimulation) {
      // make sure hex exists
      if (!Hexes.find({gameId:gameId, x:x, y:y}).count()) {
        throw new ValidationError([
          {
            name: 'armies.addPath',
            type: 'Hex does not exist.',
            details: {}
          }
        ]);
      }
    }

    var path =  {
      gameId:gameId,
      x:x,
      y:y,
      index:index,
      armyId:armyId,
      user_id:self.userId,
      createdAt:new Date(),
      paused:false,     // used to pause army movement
      countryIds:null,  // array of country ids to use in pathfinding
      hexes:null,        // path for army to follow
      distance:null,    // filled in later
      time:null,        // filled in later
      speed:null,        // filled in later
      dirtyMoveTotals:false
    }

    // path always gets army speed
    // reset last_move_at when aremy moves, is created or add index 0 path
    if (!self.isSimulation) {
      let army = Armies.findOne({_id:armyId, user_id:self.userId}, {fields: {last_move_at:1, speed:1}});
      if (army) {
        path.last_move_at = army.last_move_at;
        path.speed = army.speed;
      }
    }

    path._id = Armypaths.insert(path);

    return path._id;
  },




  removeArmyPath: function(pathId) {
    var self = this;
    check(pathId, String);

    if (!self.isSimulation) {
      var future = new Future();
      var bulk = Armypaths.rawCollection().initializeOrderedBulkOp();
      var hasBulk = false;
    }

    // get armyId and index
    var find = {user_id:this.userId, _id:pathId};
    var path = Armypaths.findOne(find);
    if (path) {
      var armyId = path.armyId;
      let gameId = path.gameId;
      //var last_move_at = path.last_move_at || new Date();

      Armypaths.remove({_id:pathId, user_id:self.userId});

      // reorder
      var index = 0;
      var find = {armyId:armyId, user_id:self.userId};
      var options = {sort:{index:1}};
      Armypaths.find(find, options).forEach(function(p) {
        var set = {index:index};

        if (path.index == 0) {
          if (p.last_move_at) {
            set.last_move_at = p.last_move_at;
          } else {
            // get last_move_at from army
            if (!self.isSimulation) {
              var find = {_id:armyId};
              var options = {fields:{last_move_at:1}};
              var army = Armies.findOne(find, options);
              if (army) {
                set.last_move_at = army.last_move_at;
              } else {
                console.error('no army found in removeArmyPath', find);
              }
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

        if (self.isSimulation) {
          Armypaths.update(p._id, {$set:set});
        } else {
          bulk.find({_id:p._id}).updateOne({$set:set});
          hasBulk = true;
        }

        index++;
      })

      if (!self.isSimulation) {
        if (hasBulk) {
          bulk.execute({}, function(error, result) {
      	    if (error) {
      	      console.error(error);
      	    }
      	    future.return(result);
      	  });
      	  future.wait();
        }
      }
    }
  },




  decreasePathIndex: function(pathId) {
    var self = this;
    check(pathId, String);

    if (!self.isSimulation) {
      var future = new Future();
      var bulk = Armypaths.rawCollection().initializeOrderedBulkOp();
    }

    // get path
    var path = Armypaths.findOne({_id:pathId, user_id:self.userId});
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
      var fields = {last_move_at:1};
      var otherPath = Armypaths.findOne({user_id:self.userId, index:path.index-1}, {fields:fields});
      if (!otherPath) {
        console.error('no otherPath found in decreasePathIndex');
        return false;
      }
      last_move_at = otherPath.last_move_at;
    }

    // move path down
    var findThis = {index:path.index, user_id:self.userId, armyId:path.armyId};
    var set = {last_move_at:last_move_at, index:path.index-1};
    if (self.isSimulation) {
      Armypaths.update(findThis, {$inc:{index:-1}, $set:set});
    } else {
      bulk.find(findThis).updateOne({$set:set});
    }

    // move other path up
    var findOther = {_id:{$ne:path._id}, index:path.index-1, user_id:self.userId, armyId:path.armyId};
    if (self.isSimulation) {
      Armypaths.update(findOther, {$set:{index:path.index}});
    } else {
      bulk.find(findOther).updateOne({$set:{index:path.index}});
    }

    // re-path
    let indexes = _.range(path.index-3, path.index+2);
    let findPath = {user_id:self.userId, armyId:path.armyId, index: {$in:indexes}};
    if (self.isSimulation) {
      Armypaths.update(findPath, {$set: {time:null, distance:null, hexes:null, countryIds:null}}, {multi:true});
    } else {
      bulk.find(findPath).update({$set: {time:null, distance:null, hexes:null, countryIds:null}});
    }

    if (!self.isSimulation) {
      bulk.execute({}, function(error, result) {
        if (error) {
          console.error(error);
        }
        future.return(result);
      });
      future.wait();
    }
  },




  increasePathIndex: function(pathId) {
    var self = this;
    check(pathId, String);

    if (!self.isSimulation) {
      var future = new Future();
      var bulk = Armypaths.rawCollection().initializeOrderedBulkOp();
    }

    // get path
    var path = Armypaths.findOne({_id:pathId, user_id:self.userId});
    if (!path) {
      throw new Meteor.Error('no path found in increasePathIndex');
    }

    // get path with highest index, last path
    var find = {armyId:path.armyId, user_id:self.userId};
    var lastPath = Armypaths.findOne(find, {sort:{index:-1}});
    if (!lastPath) {
      throw new Meteor.Error('no lastpath found in increasePathIndex');
    }

    // if this is already last path abort
    if (lastPath._id == path._id) {
      return;
    }

    // move this path up
    var find = {index:path.index, user_id:self.userId, armyId:path.armyId};
    if (self.isSimulation) {
      Armypaths.update(find, {$inc:{index:1}});
    } else {
      bulk.find(find).updateOne({$set:{index:path.index+1}});
    }

    // move other path down
    var find2 = {_id:{$ne:path._id}, index:path.index+1, user_id:self.userId, armyId:path.armyId};
    if (self.isSimulation) {
      Armypaths.update(find, {$set:{index:path.index, last_move_at:path.last_move_at}});
    } else {
      bulk.find(find2).update({$set:{index:path.index, last_move_at:path.last_move_at}});
    }

    // re-path
    let indexes = _.range(path.index-2, path.index+3);
    let find3 = {user_id:self.userId, armyId:path.armyId, index: {$in:indexes}};
    if (self.isSimulation) {
      Armypaths.update(find3, {$set: {time:null, distance:null, hexes:null, countryIds:null}}, {multi:true});
    } else {
      bulk.find(find3).update({$set: {time:null, distance:null, hexes:null, countryIds:null}});
    }

    if (!self.isSimulation) {
      bulk.execute({}, function(error, result) {
        if (error) {
          console.error(error);
        }
        future.return(result);
      });
      future.wait();
    }
  },



  pauseMovement: function(armyId) {
    var find = {armyId:armyId, user_id:this.userId};
    var options = {$set: {paused:true}};
    Armypaths.update(find, options, {multi:true});
  },

  resumeMovement: function(armyId) {
    var find = {armyId:armyId, user_id:this.userId};
    var options = {$set: {paused:false}};
    Armypaths.update(find, options, {multi:true});
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
