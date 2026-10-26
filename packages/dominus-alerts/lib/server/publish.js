// public so logged out spectators can watch
Meteor.publish('globalAlerts', function(gameId, numShow) {
    check(gameId, Match.OneOf(String, null));
    check(numShow, Match.Integer);
    numShow = Math.min(numShow, 150);
    if (Match.test(gameId, String) && Match.test(numShow, Match.Integer)) {
        return GlobalAlerts.find({gameId:gameId},{sort:{created_at:-1}, limit:numShow});
    } else {
        this.ready();
    }
});

var globalAlertsSubRule = {
  userId: function() {return true;},
  connectionId: function() {return true;},
  type: 'subscription',
  name: 'globalAlerts'
}
DDPRateLimiter.addRule(globalAlertsSubRule, 30, 5000);



// public so logged out spectators can watch
Meteor.publish('globalAlert', function(id) {
    check(id, Match.OneOf(String, null));
    if (Match.test(id, String)) {
        return GlobalAlerts.find(id);
    } else {
        this.ready();
    }
});

var globalAlertSubRule = {
  userId: function() {return true;},
  connectionId: function() {return true;},
  type: 'subscription',
  name: 'globalAlert'
}
DDPRateLimiter.addRule(globalAlertSubRule, 30, 5000);



// temporarily disable oplog until this issue is fixed
// https://github.com/meteor/meteor/issues/9087
Meteor.publish('myAlerts', function(playerId, numShow, hideAlertTypes) {
  check(playerId, Match.OneOf(String, null));
  check(numShow, Match.Integer);
  check(hideAlertTypes, Match.OneOf([String], null));
  if(this.userId) {
    hideAlertTypes = hideAlertTypes || [];
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
Meteor.publish('alertPlayer', async function(playerId) {
    check(playerId, Match.OneOf(String, null));
    var self = this
    var cur = Players.find(playerId, {fields: {userId:1, username:1, x:1, y:1, castle_id:1}})
    await Mongo.Collection._publishCursor(cur, self, 'alertplayers')
    return self.ready();
})

var alertPlayerSubRule = {
  userId: function() {return true;},
  connectionId: function() {return true;},
  type: 'subscription',
  name: 'alertPlayer'
}
DDPRateLimiter.addRule(alertPlayerSubRule, 30, 5000);




Meteor.publish('alertArmy', async function(army_id) {
    check(army_id, Match.OneOf(String, null));
    var cur = Armies.find({_id:army_id}, {fields: {playerId:1, name:1, username:1, x:1, y:1, castle_id:1}})
    await Mongo.Collection._publishCursor(cur, this, 'alertarmies')
    return this.ready();
});

var alertArmySubRule = {
  userId: function() {return true;},
  connectionId: function() {return true;},
  type: 'subscription',
  name: 'alertArmy'
}
DDPRateLimiter.addRule(alertArmySubRule, 30, 5000);




Meteor.publish('alertVillage', async function(village_id) {
    check(village_id, Match.OneOf(String, null));
    var cur = Villages.find({_id:village_id}, {fields: {playerId:1, name:1, username:1, x:1, y:1, castle_id:1}})
    await Mongo.Collection._publishCursor(cur, this, 'alertvillages')
    return this.ready();
});

var alertVillageSubRule = {
  userId: function() {return true;},
  connectionId: function() {return true;},
  type: 'subscription',
  name: 'alertVillage'
}
DDPRateLimiter.addRule(alertVillageSubRule, 30, 5000);




Meteor.publish('alertCastle', async function(castle_id) {
    check(castle_id, Match.OneOf(String, null));
    var cur = Castles.find({_id:castle_id}, {fields: {playerId:1, name:1, username:1, x:1, y:1, castle_id:1}})
    await Mongo.Collection._publishCursor(cur, this, 'alertcastles')
    return this.ready();
});

var alertCastleSubRule = {
  userId: function() {return true;},
  connectionId: function() {return true;},
  type: 'subscription',
  name: 'alertCastle'
}
DDPRateLimiter.addRule(alertCastleSubRule, 30, 5000);





Meteor.publish('alertCapital', async function(capital_id) {
  check(capital_id, Match.OneOf(String, null));
  var cur = Capitals.find({_id:capital_id}, {fields:{playerId:1, x:1, y:1}});
  await Mongo.Collection._publishCursor(cur, this, 'alertcapitals');
  return this.ready();
});

var alertCapitalSubRule = {
  userId: function() {return true;},
  connectionId: function() {return true;},
  type: 'subscription',
  name: 'alertCapital'
}
DDPRateLimiter.addRule(alertCapitalSubRule, 30, 5000);




Meteor.publish('alertChatroom', async function(room_id) {
    check(room_id, Match.OneOf(String, null));
    var self = this
    var cur = Rooms.find(room_id, {fields: {name:1}})
    await Mongo.Collection._publishCursor(cur, self, 'alertchatrooms')
    return self.ready();
});

var alertChatroomSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'alertChatroom'
}
DDPRateLimiter.addRule(alertChatroomSubRule, 30, 5000);





Meteor.publish('battleAlertTitles', async function(gameId, numShow) {
    check(gameId, Match.OneOf(String, null));
    check(numShow, Match.Integer);
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
    await Mongo.Collection._publishCursor(cur, self, 'alertbattletitles')
    return self.ready();
});

var battleAlertTitlesSubRule = {
  userId: function() {return true;},
  connectionId: function() {return true;},
  type: 'subscription',
  name: 'battleAlertTitles'
}
DDPRateLimiter.addRule(battleAlertTitlesSubRule, 30, 5000);




// unread alerts
// temporarily disable oplog until issue is fixed
// https://github.com/meteor/meteor/issues/9087
Meteor.publish('unreadAlerts', async function(playerId, hideAlertsMine) {
  check(playerId, String);
  check(hideAlertsMine, Match.OneOf([String], null));
  var self = this;
  if (!hideAlertsMine) {
    hideAlertsMine = [];
  }

  var find = {playerIds: {$elemMatch: {playerId:playerId, read:false}}, type:{$nin:hideAlertsMine}};
  var options = {fields:{_id:1}, disableOplog:true};
  var cur = Alerts.find(find, options);
  await Mongo.Collection._publishCursor(cur, self, 'unreadalerts');
  return self.ready();
});

var unreadAlertsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'unreadAlerts'
}
DDPRateLimiter.addRule(unreadAlertsSubRule, 30, 5000);
