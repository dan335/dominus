Meteor.publish('battle', function(id) {
  if (id) {
    return Battles2.find(id)
  }
  this.ready();
});

var battleSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'battle'
}
DDPRateLimiter.addRule(battleSubRule, 10, 5000);




Meteor.publish('battle_notifications_at_hex', function(gameId, x, y) {
  var fields = {
    createdAt:1,
    updatedAt:1,
    isOver:1,
    x:1,
    y:1,
    titleInfo:1,
    gameId:1
  };

  if (this.userId) {
    if (typeof x != 'undefined' && typeof y != 'undefined') {
      return Battles2.find({gameId:gameId, x:x, y:y, isOver:false}, {fields:fields});
    }
  }
  this.ready();
});

var battle_notifications_at_hexSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'battle_notifications_at_hex'
}
DDPRateLimiter.addRule(battle_notifications_at_hexSubRule, 10, 5000);



Meteor.publish('fight', function(id) {
  if (id) {
    return Rounds.find(id)
  }
  this.ready()
});

var fightSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'fight'
}
DDPRateLimiter.addRule(fightSubRule, 10, 5000);



Meteor.publish('lastFightInBattle', function(battle_id) {
  if (battle_id) {
    return Rounds.find({battle_id:battle_id}, {sort:{roundNumber:-1}, limit:1})
  }
  this.ready()
});

var lastFightInBattleSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'lastFightInBattle'
}
DDPRateLimiter.addRule(lastFightInBattleSubRule, 10, 5000);




Meteor.publish('roundtitles', function(battle_id) {
  var sub = this;
  var cur = Rounds.find({battle_id:battle_id}, {fields: { roundNumber:1, battle_id:1, createdAt:1 }});
  Mongo.Collection._publishCursor(cur, sub, 'roundtitles');
  return sub.ready();
});

var roundtitlesSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'roundtitles'
}
DDPRateLimiter.addRule(roundtitlesSubRule, 10, 5000);
