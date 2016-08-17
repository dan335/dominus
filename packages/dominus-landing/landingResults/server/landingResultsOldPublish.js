// results from old code base

Meteor.publish('oldResultsTitles', function() {
  let fields = {
    name:1,
    "results.winner.username":1,
    startDate:1,
    createdAt:1,
    gameNumber:1
  };
  return OldResults.find({}, {fields:fields}, {disableOplog:true, pollingIntervalMs:1000*60*30});
});

var oldResultsTitlesSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'oldResultsTitles'
}
DDPRateLimiter.addRule(oldResultsTitlesSubRule, 5, 5000);




Meteor.publish('oldResultsDetails', function(resultId) {
  var query = OldResults.find(resultId, {}, {disableOplog:true, pollingIntervalMs:1000*60*30})
  Mongo.Collection._publishCursor(query, this, 'oldresultsdetails')
  return this.ready()
});

var oldResultsDetailsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'oldResultsDetails'
}
DDPRateLimiter.addRule(oldResultsDetailsSubRule, 5, 5000);
