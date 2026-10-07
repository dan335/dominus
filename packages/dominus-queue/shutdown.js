Meteor.startup(function() {
  if (process.env.DOMINUS_WORKER == 'true') {

    Meteor.call('resumeJobQueue', function(error, result) {
      console.log('--- queue started ---');
    });

    ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(function(signal) {
      process.on(signal, Meteor.bindEnvironment(() => {
        shutdown(signal);
      }));
    });

  }
});





// Stop only this worker: pause its queues locally so it takes no new jobs
// (other workers keep going), then exit after a grace period.
// The old version paused every queue globally and never exited, so one
// worker's deploy stopped all workers until the new one started and resumed.
//
// Job handlers run their work in Meteor fibers (Meteor.bindEnvironment), and
// Bull may count a job as finished before that work is done, so the grace
// period is a fixed wait rather than Bull's wait-for-active-jobs. It is kept
// under docker's 10s stop timeout. The Redis connections stay open until exit
// because running work may still add jobs.
Queues.shutdownGraceMs = 1000*8;

var shuttingDown = false;

var shutdown = function(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log('--- ' + signal + ': stopping this worker ---');

  setTimeout(() => {
    console.log('--- exiting ---');
    process.exit(0);
  }, Queues.shutdownGraceMs);

  const logError = (error) => { console.log(error); };

  Queues.queueNames.forEach((jobName) => {
    // local pause; true = don't wait for active jobs (see above)
    Promise.resolve(Queues[jobName].pause(true, true)).catch(logError);
  });
  console.log('--- queue paused on this worker, waiting for running work ---');
};
