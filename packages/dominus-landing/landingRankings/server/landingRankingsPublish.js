Meteor.publish('overallRankingsRegular', function() {
  let query = Meteor.users.find({"rankingRegular.numGames": {$gt:0}, "rankingRegular.overallRank": {$gt:0}}, {fields:{username:1, rankingRegular:1}}, {disableOplog:true, pollingIntervalMs:1000*60*30})
  Mongo.Collection._publishCursor(query, this, 'overallrankingsregular')
  return this.ready();
});

Meteor.publish('overallRankingsPro', function() {
  let query = Meteor.users.find({"rankingPro.numGames": {$gt:0}, "rankingPro.overallRank": {$gt:0}}, {fields:{username:1, rankingPro:1}}, {disableOplog:true, pollingIntervalMs:1000*60*30})
  Mongo.Collection._publishCursor(query, this, 'overallrankingspro')
  return this.ready();
})

var landingRankingsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'landingRankings'
}
DDPRateLimiter.addRule(landingRankingsSubRule, 5, 5000);
