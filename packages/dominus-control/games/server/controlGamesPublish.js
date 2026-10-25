Meteor.publish('gamesForControl', async function() {
  if (!this.userId) {
    return this.ready();
  }

  var user = await Meteor.users.findOneAsync(this.userId, {fields:{admin:1, moderator:1}});
  if (!user) {
    return this.ready();
  }

  if (!user.admin && !user.moderator) {
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




Meteor.publish('gameForControl', async function(gameId) {
  check(gameId, Match.OneOf(String, null));
  if (!this.userId) {
    return this.ready();
  }

  var user = await Meteor.users.findOneAsync(this.userId, {fields:{admin:1, moderator:1}});
  if (!user) {
    return this.ready();
  }

  if (!user.admin && !user.moderator) {
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
