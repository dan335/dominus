Meteor.methods({
  setMarkerOrder: function(id, fromGroupId, toGroupId, oldIndex, newIndex) {
    // remove from group
    Markers.update({user_id:this.userId, groupId:fromGroupId, order:{$gte:oldIndex}}, {$inc:{order:-1}}, {multi:true});
    // make space
    Markers.update({user_id:this.userId, groupId:toGroupId, order:{$gte:newIndex}}, {$inc:{order:1}}, {multi:true});
    // move to new order and set group
    Markers.update({user_id:this.userId, _id:id}, {$set:{order:newIndex, groupId:toGroupId}});
  },

  saveMarkerInfo: function(id, name, desc) {
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

    Markers.update({_id:id, user_id:this.userId}, {$set:{name:name, description:desc}});
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

    MarkerGroups.update({_id:id, user_id:this.userId}, {$set:{name:name}});
  },

  moveMarkerGroupUp: function(id) {
    MarkerGroups.update({user_id:this.userId, _id:id}, {$inc: {order:-1.5}});
    Meteor.call('fixMarkerGroupOrder');
  },

  moveMarkerGroupDown: function(id) {
    MarkerGroups.update({user_id:this.userId, _id:id}, {$inc: {order:1.5}});
    Meteor.call('fixMarkerGroupOrder');
  },

  fixMarkerGroupOrder: function() {
    var self = this;
    var order = 0;
    var find = {user_id:this.userId};
    var options = {fields: {_id:1}, sort: {order:1}};
    MarkerGroups.find(find, options).forEach(function(group) {
      MarkerGroups.update({_id:group._id, user_id:self.userId}, {$set:{order:order}});
      order++;
    })
  },

  removeMarkerGroup: function(id) {
    Markers.remove({user_id:this.userId, groupId:id});
    MarkerGroups.remove({_id:id, user_id:this.userId});
    Meteor.call('fixMarkerGroupOrder');
  },

  addMarkerGroup: function(gameId, name) {
    name = name.toString();
    name = name.replace(/[^0-9a-zA-Z_\s]/g, '');

    if (name.length == 0) {
      throw new Meteor.Error('Name too short.');
    }

    if (name.length > 35) {
      throw new Meteor.Error('Name too long.');
    }

    let player = Players.findOne({userId:this.userId, gameId:gameId}, {fields: {_id:1, pro:1}});
    if (!player) {
      throw new Meteor.Error('No player found.');
    }

    var numGroups = MarkerGroups.find({user_id:this.userId}).count();
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

    var data = {
      name:name,
      createdAt:new Date(),
      updatedAt: new Date(),
      user_id: this.userId,
      order:numGroups,
      gameId:gameId,
      playerId:player._id
    };

    MarkerGroups.insert(data);
  },

  removeMarker: function(id) {
    Markers.remove({user_id:this.userId, _id:id});
  }
})



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
