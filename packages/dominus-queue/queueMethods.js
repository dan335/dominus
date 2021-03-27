Meteor.methods({
  pauseJobQueue: function() {
    let Future = Npm.require('fibers/future');

    Settings.upsert({}, {$set: {isPaused:true}});

    Queues.queueNames.forEach(function(jobName) {
      let future = new Future();
      Queues[jobName].pause().then(Meteor.bindEnvironment(function() {
        future.return(true);
      })).catch(error => {
        console.log(error);
      })
      future.wait();
    });
  },


  resumeJobQueue: function() {
    let Future = Npm.require('fibers/future');

    Settings.upsert({}, {$set: {isPaused:false}});

    Queues.queueNames.forEach(function(jobName) {
      let future = new Future();
      Queues[jobName].resume().then(Meteor.bindEnvironment(function() {
        future.return(true);
      })).then(error => {
        console.log(error);
      })
      future.wait();
    });
  },


  clearUniqueIdsForJob: function(jobName) {
    const queue = Queues[jobName];

    if (!queue) {
      console.error("Job '" + jobName + "' not found.");
      return;
    }

    Queues.clearUniqueIdsForJob(jobName);
  },

  runBullJob: function(jobName, jobData) {
    var user = Meteor.users.findOne(this.userId, {fields:{admin:1}});
    if (!user || !user.admin) {
      throw new Meteor.Error('control.games.addGame', 'Must be admin.');
    }

    console.log('running job', jobName, jobData);
    Queues.add(jobName, jobData, {delay:0, timeout:1000*60*5}, false);
  }
});
