Queues.create('updateOverallPlayerRankings');

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.updateOverallPlayerRankings.process(Meteor.bindEnvironment(function(job) {
    dRankings.updateOverallPlayerRankings();
    return Promise.resolve();
  }));
}
