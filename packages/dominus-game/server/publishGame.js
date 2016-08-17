// client needs game info for the game person is playing for settings
// subscribe is in Template.game.onCreated
Meteor.publish('game', function(gameId) {
  let fields = {
    isSpeed:1,
    isSuperSpeed:1,
    isKingOfHill:1,
    isProOnly:1,
    maxPlayers:1,
    name:1,
    numPlayers:1,
    numVillages:1,
    numCountries:1,
    taxesCollected:1,
    tree:1,
    hasEnded:1,
    hasStarted:1,
    hasClosed:1,
    endDate:1,
    closeDate:1,
    lastDominusPlayerId:1,
    winningPlayer:1,
    map_size:1,
    minimapBgPath:1,
    minimapUpdatedAt:1,
    minimap:1,
    lastIncomeUpdate:1
  };

  if (this.userId) {
    return Games.find({_id:gameId}, {fields:fields});
  } else {
    return this.ready();
  }
});

var gameSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'game'
}
DDPRateLimiter.addRule(gameSubRule, 5, 5000);


// subscribed from template.game.onCreated
Meteor.publish('player', function(gameId) {
  if (this.userId) {
    return Players.find({gameId:gameId, userId:this.userId}, {fields: {incomeFromVassals:0, incomeFromVillages:0, incomeFromCapitals:0}});
  } else {
    return this.ready();
  }
});

var playerSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'player'
}
DDPRateLimiter.addRule(playerSubRule, 5, 5000);


// publish global settings to everyone
Meteor.publish(null, function() {
  return Settings.find();
});
