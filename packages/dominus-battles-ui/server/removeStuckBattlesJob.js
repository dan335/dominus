if (process.env.DOMINUS_WORKER == 'true') {
  Queues.removeStuckBattles.process(Meteor.bindEnvironment(function(job) {
    dBattles.removeStuckBattles();
    return Promise.resolve();
  }));
}



dBattles.removeStuckBattles = function() {
  let cutoff = moment().subtract(3, 'hours').toDate();
  Battles2.update({isRunning:true, updatedAt: {$lt:cutoff}}, {$set: {isRunning:false}}, {multi:true});
}
