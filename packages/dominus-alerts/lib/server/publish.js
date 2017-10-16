Meteor.publish('globalAlerts', function(gameId, numShow) {
    numShow = Math.min(numShow, 150);
    if(this.userId) {
        return GlobalAlerts.find({gameId:gameId},{sort:{created_at:-1}, limit:numShow});
    } else {
        this.ready();
    }
});

var globalAlertsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'globalAlerts'
}
DDPRateLimiter.addRule(globalAlertsSubRule, 30, 5000);



Meteor.publish('globalAlert', function(id) {
    if(this.userId) {
        return GlobalAlerts.find(id);
    } else {
        this.ready();
    }
});

var globalAlertSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'globalAlert'
}
DDPRateLimiter.addRule(globalAlertSubRule, 30, 5000);



// temporarily disable oplog until this issue is fixed
// https://github.com/meteor/meteor/issues/9087
Meteor.publish('myAlerts', function(playerId, numShow, hideAlertTypes) {
  if(this.userId) {
    check(hideAlertTypes, Array);
    numShow = Math.min(numShow, 150);
    var find = {playerIds: {$elemMatch: {playerId:playerId}}, type:{$nin:hideAlertTypes}};
    var options = {sort:{created_at:-1}, limit:numShow, disableOplog:true};
    return Alerts.find(find, options);
  } else {
    this.ready();
  }
});

var myAlertsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'myAlerts'
}
DDPRateLimiter.addRule(myAlertsSubRule, 30, 5000);



// client only collection
Meteor.publish('alertPlayer', function(playerId) {
    var self = this
    var cur = Players.find(playerId, {fields: {userId:1, username:1, x:1, y:1, castle_id:1}})
    Mongo.Collection._publishCursor(cur, self, 'alertplayers')
    return self.ready();
})

var alertPlayerSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'alertPlayer'
}
DDPRateLimiter.addRule(alertPlayerSubRule, 30, 5000);




Meteor.publish('alertArmy', function(army_id) {
    var cur = Armies.find({_id:army_id}, {fields: {playerId:1, name:1, username:1, x:1, y:1, castle_id:1}})
    Mongo.Collection._publishCursor(cur, this, 'alertarmies')
    return this.ready();
});

var alertArmySubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'alertArmy'
}
DDPRateLimiter.addRule(alertArmySubRule, 30, 5000);




Meteor.publish('alertVillage', function(village_id) {
    var cur = Villages.find({_id:village_id}, {fields: {playerId:1, name:1, username:1, x:1, y:1, castle_id:1}})
    Mongo.Collection._publishCursor(cur, this, 'alertvillages')
    return this.ready();
});

var alertVillageSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'alertVillage'
}
DDPRateLimiter.addRule(alertVillageSubRule, 30, 5000);




Meteor.publish('alertCastle', function(castle_id) {
    var cur = Castles.find({_id:castle_id}, {fields: {playerId:1, name:1, username:1, x:1, y:1, castle_id:1}})
    Mongo.Collection._publishCursor(cur, this, 'alertcastles')
    return this.ready();
});

var alertCastleSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'alertCastle'
}
DDPRateLimiter.addRule(alertCastleSubRule, 30, 5000);





Meteor.publish('alertCapital', function(capital_id) {
  var cur = Capitals.find({_id:capital_id}, {fields:{playerId:1, x:1, y:1}});
  Mongo.Collection._publishCursor(cur, this, 'alertcapitals');
  return this.ready();
});

var alertCapitalSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'alertCapital'
}
DDPRateLimiter.addRule(alertCapitalSubRule, 30, 5000);




Meteor.publish('alertChatroom', function(room_id) {
    var self = this
    var cur = Rooms.find(room_id, {fields: {name:1}})
    Mongo.Collection._publishCursor(cur, self, 'alertchatrooms')
    return self.ready();
});

var alertChatroomSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'alertChatroom'
}
DDPRateLimiter.addRule(alertChatroomSubRule, 30, 5000);





Meteor.publish('battleAlertTitles', function(gameId, numShow) {
    var self = this
    var fields = {
        createdAt:1,
        updatedAt:1,
        isOver:1,
        x:1,
        y:1,
        titleInfo:1,
        gameId:1
      };

    //var cur = Battles2.find({showBattle:true, gameId:gameId},{sort:{updatedAt:-1}, limit:numShow, fields:fields})
    var cur = Battles2.find({gameId:gameId},{sort:{updatedAt:-1}, limit:numShow, fields:fields})
    Mongo.Collection._publishCursor(cur, self, 'alertbattletitles')
    return self.ready();
});

var battleAlertTitlesSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'battleAlertTitles'
}
DDPRateLimiter.addRule(battleAlertTitlesSubRule, 30, 5000);




// unread alerts
// temporarily disable oplog until issue is fixed
// https://github.com/meteor/meteor/issues/9087
Meteor.publish('unreadAlerts', function(playerId, hideAlertsMine) {
  check(playerId, String);
  var self = this;
  if (!hideAlertsMine) {
    hideAlertsMine = [];
  }

  var find = {playerIds: {$elemMatch: {playerId:playerId, read:false}}, type:{$nin:hideAlertsMine}};
  var options = {fields:{_id:1}, disableOplog:true};
  var cur = Alerts.find(find, options);
  Mongo.Collection._publishCursor(cur, self, 'unreadalerts');
  return self.ready();
});

var unreadAlertsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'unreadAlerts'
}
DDPRateLimiter.addRule(unreadAlertsSubRule, 30, 5000);
