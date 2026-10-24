Queues.create('updateOverallPlayerRankings');

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.updateOverallPlayerRankings.process(async function(job) {
    await dRankings.updateOverallPlayerRankings();
  });
}
