Meteor.publish('landingResultTitles', function() {
  let fields = {numPlayers:1, maxPlayers:1, isLazy:1, isSpeed:1, isSuperSpeed:1, isKingOfHill:1, isProOnly:1, hasEnded:1, name:1, winningPlayer:1, startedAt:1, endDate:1};
  return Games.find({hasEnded:true}, {fields:fields}, {disableOplog:true});
});

var landingResultTitlesSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'landingResultTitles'
}
DDPRateLimiter.addRule(landingResultTitlesSubRule, 5, 5000);




Meteor.publish('landingResult', function(gameId) {
  var query = Games.find(gameId, {}, {disableOplog:true});
  Mongo.Collection._publishCursor(query, this, 'gameresult');
  return this.ready();
});

var landingResultSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'landingResult'
}
DDPRateLimiter.addRule(landingResultSubRule, 5, 5000);
