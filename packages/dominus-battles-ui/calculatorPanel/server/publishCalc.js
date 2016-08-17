Meteor.publish('calcPlayer', function(playerId) {
  var fields = {user_id:1, allies_below:1, allies_above:1, team:1, king:1, lord:1, vassals:1, is_dominus:1, username:1};
  var sub = this
  var cur = Players.find(playerId, {fields:fields});
  Mongo.Collection._publishCursor(cur, sub, 'calcplayers')
  return sub.ready()
});

var calcPlayerSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'calcPlayer'
}
DDPRateLimiter.addRule(calcPlayerSubRule, 5, 5000);
