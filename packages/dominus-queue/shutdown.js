Meteor.startup(async function() {
  if (process.env.DOMINUS_WORKER == 'true') {

    try {
      await Queues.resumeAllAsync();
    } catch (error) {
      // resumeAllAsync logged it, and Settings keeps isPaused
    }
    console.log('--- queue started ---');

    ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(function(signal) {
      process.on(signal, Meteor.bindEnvironment(() => {
        shutdown(signal);
      }));
    });

  }
});





// Stop only this worker: pause its queues locally so it takes no new jobs
// (other workers keep going), wait for the work of its running jobs to end,
// then exit. It exits after the grace period even if work is still running,
// so keep the grace period under docker's stop timeout (10s by default,
// stop_grace_period in the compose file). DOMINUS_SHUTDOWN_GRACE_MS sets it.
// The Redis connections stay open until exit because running work may still
// add jobs.
Queues.shutdownGraceMs = Number(process.env.DOMINUS_SHUTDOWN_GRACE_MS) || 1000*8;

var shuttingDown = false;

var shutdown = function(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log('--- ' + signal + ': stopping this worker ---');

  Queues.stopWorker(Queues.shutdownGraceMs).then((idle) => {
    console.log(idle ? '--- all work done, exiting ---' : '--- grace period over, exiting with work still running ---');
    process.exit(0);
  });
};


// Pauses every queue on this worker only, and resolves once no job's work is
// running here, or after graceMs: with true if all work ended, false if not.
// Every job's work runs through Queues.runJob, so Queues.whenIdle sees all of
// it, including a job that hit its timeout but whose work still runs. Bull's
// own wait for active jobs (pause(true) without doNotWaitActive, and close())
// is not used: under Meteor's fibers, Node 14 aborts (AsyncHooks::
// push_async_context) when its Promise.all over the queue's processing loop
// settles. After the work ends, Bull gets a moment to mark the jobs completed.
Queues.stopWorkerSettleMs = 300;

// Pauses every queue on this worker only, without Bull's wait for active jobs
// (see above). Bull then drops and remakes each queue's blocking Redis
// connection; if ioredis is already reconnecting it, Bull's promise rejects
// with "Redis is already connecting/connected", which is harmless.
Queues.pauseLocal = function() {
  Queues.queueNames.forEach((jobName) => {
    Promise.resolve(Queues[jobName].pause(true, true)).catch((error) => {
      if (!/already connecting\/connected/.test(error && error.message)) {
        console.log('could not pause job queue ' + jobName + ' on this worker', error);
      }
    });
  });
};

Queues.stopWorker = function(graceMs) {
  Queues.pauseLocal();
  console.log('--- queue paused on this worker, waiting for running work ---');

  return Queues.whenIdle(graceMs).then((idle) => {
    if (!idle) {
      return idle;
    }
    return new Promise((resolve) => setTimeout(() => resolve(idle), Queues.stopWorkerSettleMs));
  });
};
