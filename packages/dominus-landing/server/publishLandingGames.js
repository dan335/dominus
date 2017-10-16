Meteor.publish('landingGames', function() {
  var landingGameFields = {isNoLargeResources:1, isKingOfHill:1, isLazy:1, isSpeed:1, isSuperSpeed:1, isProOnly:1, numPlayers:1, startAt:1, maxPlayers:1, name:1, desc:1, hasEnded:1, hasStarted:1};
  return Games.find({hasEnded:false}, {fields:landingGameFields});
});

var landingGamesSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'landingGames'
}
DDPRateLimiter.addRule(landingGamesSubRule, 5, 5000);




Meteor.publish('landingGame', function(gameId) {
  var landingGameFields = {isNoLargeResources:1, isKingOfHill:1, isLazy:1, isSpeed:1, isSuperSpeed:1, isProOnly:1, numPlayers:1, startAt:1, maxPlayers:1, name:1, desc:1, hasEnded:1, hasStarted:1};
  return Games.find(gameId, {fields:landingGameFields});
});

var landingGameSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'landingGame'
}
DDPRateLimiter.addRule(landingGameSubRule, 5, 5000);



Meteor.publish('gamesSignups', function() {
  return Gamesignups.find({}, {}, {disableOplog:true, pollingIntervalMs:1000*60*5});
})


var gamesSignupsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'gamesSignups'
}
DDPRateLimiter.addRule(gamesSignupsSubRule, 5, 5000);




Meteor.publish('gameSignups', function(gameId) {
  this.unblock();
  return Gamesignups.find({gameId:gameId});
});

var gameSignupsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'gameSignups'
}
DDPRateLimiter.addRule(gameSignupsSubRule, 5, 5000);
