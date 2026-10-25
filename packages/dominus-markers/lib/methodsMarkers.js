// The browser runs a sync copy of each change as its simulation, so the
// markers panel moves at once, and the server runs the async part the method
// returns. The method itself stays sync: on 2.16 two async simulations that
// overlap throw "Called saveOriginals twice without retrieveOriginals" in the
// browser, and the second change is lost.
Meteor.methods({
  setMarkerOrder: function(id, fromGroupId, toGroupId, oldIndex, newIndex) {
    check(id, String);
    check(fromGroupId, Match.OneOf(String, Number));
    check(toGroupId, Match.OneOf(String, Number));
    check(oldIndex, Match.Integer);
    check(newIndex, Match.Integer);
    var fromGroup = {user_id:this.userId, groupId:fromGroupId, order:{$gte:oldIndex}};
    var toGroup = {user_id:this.userId, groupId:toGroupId, order:{$gte:newIndex}};
    var marker = {user_id:this.userId, _id:id};
    var move = {$set:{order:newIndex, groupId:toGroupId}};
    if (this.isSimulation) {
      Markers.update(fromGroup, {$inc:{order:-1}}, {multi:true});
      Markers.update(toGroup, {$inc:{order:1}}, {multi:true});
      Markers.update(marker, move);
      return;
    }
    return (async () => {
      // remove from group
      await Markers.updateAsync(fromGroup, {$inc:{order:-1}}, {multi:true});
      // make space
      await Markers.updateAsync(toGroup, {$inc:{order:1}}, {multi:true});
      // move to new order and set group
      await Markers.updateAsync(marker, move);
    })();
  },

  saveMarkerInfo: function(id, name, desc) {
    check(desc, String);
    check(id, String);
    check(name, String);

    name = name.toString();
    desc = desc.toString();

    name = name.replace(/[^0-9a-zA-Z_\s]/g, '');
    desc = desc.replace(/[^0-9a-zA-Z_\s]/g, '');

    if (name.length == 0) {
      throw new Meteor.Error('Name too short.');
    }

    if (name.length > 35) {
      throw new Meteor.Error('Name too long.');
    }

    if (desc.length > 400) {
      throw new Meteor.Error('Description too long.');
    }

    var selector = {_id:id, user_id:this.userId};
    var modifier = {$set:{name:name, description:desc}};
    if (this.isSimulation) {
      Markers.update(selector, modifier);
      return;
    }
    return (async () => {
      await Markers.updateAsync(selector, modifier);
    })();
  },

  saveMarkerGroupInfo: function(id, name) {
    check(id, String);
    check(name, String);

    name = name.toString();
    name = name.replace(/[^0-9a-zA-Z_\s]/g, '');

    if (name.length == 0) {
      throw new Meteor.Error('Name too short.');
    }

    if (name.length > 35) {
      throw new Meteor.Error('Name too long.');
    }

    var selector = {_id:id, user_id:this.userId};
    var modifier = {$set:{name:name}};
    if (this.isSimulation) {
      MarkerGroups.update(selector, modifier);
      return;
    }
    return (async () => {
      await MarkerGroups.updateAsync(selector, modifier);
    })();
  },

  moveMarkerGroupUp: function(id) {
    check(id, Match.OneOf(String, Number));
    var selector = {user_id:this.userId, _id:id};
    if (this.isSimulation) {
      MarkerGroups.update(selector, {$inc: {order:-1.5}});
      fixMarkerGroupOrderSim(this.userId);
      return;
    }
    return (async () => {
      await MarkerGroups.updateAsync(selector, {$inc: {order:-1.5}});
      await fixMarkerGroupOrder(this.userId);
    })();
  },

  moveMarkerGroupDown: function(id) {
    check(id, Match.OneOf(String, Number));
    var selector = {user_id:this.userId, _id:id};
    if (this.isSimulation) {
      MarkerGroups.update(selector, {$inc: {order:1.5}});
      fixMarkerGroupOrderSim(this.userId);
      return;
    }
    return (async () => {
      await MarkerGroups.updateAsync(selector, {$inc: {order:1.5}});
      await fixMarkerGroupOrder(this.userId);
    })();
  },

  fixMarkerGroupOrder: function() {
    if (this.isSimulation) {
      fixMarkerGroupOrderSim(this.userId);
      return;
    }
    return (async () => {
      await fixMarkerGroupOrder(this.userId);
    })();
  },

  removeMarkerGroup: function(id) {
    check(id, Match.OneOf(String, Number));
    var markers = {user_id:this.userId, groupId:id};
    var group = {_id:id, user_id:this.userId};
    if (this.isSimulation) {
      Markers.remove(markers);
      MarkerGroups.remove(group);
      fixMarkerGroupOrderSim(this.userId);
      return;
    }
    return (async () => {
      await Markers.removeAsync(markers);
      await MarkerGroups.removeAsync(group);
      await fixMarkerGroupOrder(this.userId);
    })();
  },

  addMarkerGroup: function(gameId, name) {
    check(gameId, String);
    check(name, String);
    name = name.toString();
    name = name.replace(/[^0-9a-zA-Z_\s]/g, '');

    if (name.length == 0) {
      throw new Meteor.Error('Name too short.');
    }

    if (name.length > 35) {
      throw new Meteor.Error('Name too long.');
    }

    var playerSelector = {userId:this.userId, gameId:gameId};
    var playerOptions = {fields: {_id:1, pro:1}};
    if (this.isSimulation) {
      let player = Players.findOne(playerSelector, playerOptions);
      let numGroups = MarkerGroups.find({user_id:this.userId}).count();
      MarkerGroups.insert(newMarkerGroup(this.userId, gameId, name, player, numGroups));
      return;
    }
    return (async () => {
      let player = await Players.findOneAsync(playerSelector, playerOptions);
      let numGroups = player ? await MarkerGroups.find({user_id:this.userId}).countAsync() : 0;
      await MarkerGroups.insertAsync(newMarkerGroup(this.userId, gameId, name, player, numGroups));
    })();
  },

  removeMarker: function(id) {
    check(id, String);
    var selector = {user_id:this.userId, _id:id};
    if (this.isSimulation) {
      Markers.remove(selector);
      return;
    }
    return (async () => {
      await Markers.removeAsync(selector);
    })();
  }
})


// the group addMarkerGroup inserts, or throws if the player can't have another
var newMarkerGroup = function(userId, gameId, name, player, numGroups) {
  if (!player) {
    throw new Meteor.Error('No player found.');
  }

  var max = 0;
  if (player.pro) {
    max = _s.markers.maxGroupsPro;
  } else {
    max = _s.markers.maxGroupsNonPro;
  }
  if (numGroups >= max)
  {
    throw new Meteor.Error('Too many groups.  Limited to '+max);
  }

  return {
    name:name,
    createdAt:dClock.now(),
    updatedAt: dClock.now(),
    user_id: userId,
    order:numGroups,
    gameId:gameId,
    playerId:player._id
  };
};

// numbers a user's marker groups 0, 1, 2... in their current order
var fixMarkerGroupOrder = async function(userId) {
  var order = 0;
  var options = {fields: {_id:1}, sort: {order:1}};
  for (const group of await MarkerGroups.find({user_id:userId}, options).fetchAsync()) {
    await MarkerGroups.updateAsync({_id:group._id, user_id:userId}, {$set:{order:order}});
    order++;
  }
};

// the same, on the client's copy
var fixMarkerGroupOrderSim = function(userId) {
  var order = 0;
  var options = {fields: {_id:1}, sort: {order:1}};
  MarkerGroups.find({user_id:userId}, options).forEach(function(group) {
    MarkerGroups.update({_id:group._id, user_id:userId}, {$set:{order:order}});
    order++;
  });
};



if (Meteor.isServer) {
  var removeMarkerRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'removeMarker'
  }
  DDPRateLimiter.addRule(removeMarkerRule, 5, 5000);

  var addMarkerGroupRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'addMarkerGroup'
  }
  DDPRateLimiter.addRule(addMarkerGroupRule, 5, 5000);

  var removeMarkerGroupRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'removeMarkerGroup'
  }
  DDPRateLimiter.addRule(removeMarkerGroupRule, 5, 5000);

  var fixMarkerGroupOrderRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'fixMarkerGroupOrder'
  }
  DDPRateLimiter.addRule(fixMarkerGroupOrderRule, 10, 5000);

  var moveMarkerGroupDownRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'moveMarkerGroupDown'
  }
  DDPRateLimiter.addRule(moveMarkerGroupDownRule, 5, 5000);

  var moveMarkerGroupUpRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'moveMarkerGroupUp'
  }
  DDPRateLimiter.addRule(moveMarkerGroupUpRule, 5, 5000);

  var saveMarkerGroupInfoRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'saveMarkerGroupInfo'
  }
  DDPRateLimiter.addRule(saveMarkerGroupInfoRule, 5, 5000);

  var saveMarkerInfoRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'saveMarkerInfo'
  }
  DDPRateLimiter.addRule(saveMarkerInfoRule, 5, 5000);

  var setMarkerOrderRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'setMarkerOrder'
  }
  DDPRateLimiter.addRule(setMarkerOrderRule, 5, 5000);
}
