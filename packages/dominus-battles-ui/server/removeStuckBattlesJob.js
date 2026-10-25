if (process.env.DOMINUS_WORKER == 'true') {
  Queues.removeStuckBattles.process(async function(job) {
    await dBattles.removeStuckBattles();
  });
}



dBattles.removeStuckBattles = async function() {
  let cutoff = moment(dClock.now()).subtract(3, 'hours').toDate();
  await Battles2.updateAsync({isRunning:true, updatedAt: {$lt:cutoff}}, {$set: {isRunning:false}}, {multi:true});
}
