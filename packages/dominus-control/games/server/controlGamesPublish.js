Meteor.publish('gamesForControl', function() {
  if (!this.userId) {
    return this.ready();
  }

  var user = Meteor.users.findOne(this.userId, {fields:{admin:1}});
  if (!user || !user.admin) {
    return this.ready();
  }

  return Games.find({}, {sort: {createdAt:-1}, limit:20});
});

var gamesForControlSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'gamesForControl'
}
DDPRateLimiter.addRule(gamesForControlSubRule, 5, 5000);




Meteor.publish('gameForControl', function(gameId) {
  if (!this.userId) {
    return this.ready();
  }

  var user = Meteor.users.findOne(this.userId, {fields:{admin:1}});
  if (!user || !user.admin) {
    return this.ready();
  }

  return [
    Games.find({_id:gameId}),
    Gamesignups.find({gameId:gameId})
  ];
});

var gameForControlSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'gameForControl'
}
DDPRateLimiter.addRule(gameForControlSubRule, 5, 5000);
