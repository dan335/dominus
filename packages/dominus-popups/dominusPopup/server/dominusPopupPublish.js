Meteor.publish('dominusPopupGameId', function(gameId) {
    var sub = this
    var cur = Players.find({gameId:gameId, is_dominus:true}, {fields: {
        username:1,
        castle_id:1,
        x:1,
        y:1,
        is_dominus:1,
        userId:1
    }});
    Mongo.Collection._publishCursor(cur, sub, 'dominusplayer')
    return sub.ready();
});

var dominusPopupGameIdSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'dominusPopupGameId'
}
DDPRateLimiter.addRule(dominusPopupGameIdSubRule, 5, 5000);



Meteor.publish('dominusPopupPlayer', function(playerId) {
    var sub = this
    var cur = Players.find(playerId, {fields: {
        username:1,
        castle_id:1,
        x:1,
        y:1,
        is_dominus:1,
        userId:1
    }})
    Mongo.Collection._publishCursor(cur, sub, 'dominusplayer')
    return sub.ready();
});

var dominusPopupPlayerSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'dominusPopupPlayer'
}
DDPRateLimiter.addRule(dominusPopupPlayerSubRule, 5, 5000);
