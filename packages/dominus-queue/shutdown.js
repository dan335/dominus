let Future = Npm.require('fibers/future');

Meteor.startup(function() {
  if (process.env.DOMINUS_WORKER == 'true') {

    Meteor.call('resumeJobQueue', function(error, result) {
      console.log('--- queue started ---');
    });

    process.on('SIGINT', Meteor.bindEnvironment(() => {
      shutdown();
    }));

    process.on('SIGTERM', Meteor.bindEnvironment(() => {
      shutdown();
    }));

    process.on('SIGHUP', Meteor.bindEnvironment(() => {
      shutdown();
    }));

  }
});





var shutdown = function() {
  let promises = [];

  Queues.queueNames.forEach((jobName) => {
    promises.push(new Promise((resolve, reject) => {
      Queues[jobName].pause().then(() => { resolve(); })
    }))
  })

  Promise.all(promises).then(() => {
    console.log('--- queue paused ---');

    setTimeout(() => {
      console.log('--- waited for jobs ---');
    }, 1000 * 8)
  })

}
