Meteor.methods({
  pauseJobQueue: function() {
    // allow trusted server-side calls (this.connection === null, e.g. the
    // relationship-rebuild job that pauses the queue while it runs); block
    // client (DDP) calls from non-admins -- otherwise any player could freeze
    // battles/income/movement for every game on the server.
    if (this.connection) {
      var user = Meteor.users.findOne(this.userId, {fields:{admin:1}});
      if (!user || !user.admin) {
        throw new Meteor.Error('not-authorized', 'Must be admin.');
      }
    }

    // a pause from the admin panel is deliberate; the stuck-pause safety net leaves it alone
    Queues.pauseAll(!!this.connection);
  },


  resumeJobQueue: function() {
    // allow trusted server-side calls; block non-admin client calls (see pauseJobQueue).
    if (this.connection) {
      var user = Meteor.users.findOne(this.userId, {fields:{admin:1}});
      if (!user || !user.admin) {
        throw new Meteor.Error('not-authorized', 'Must be admin.');
      }
    }

    Queues.resumeAll();
  },


  clearUniqueIdsForJob: function(jobName) {
    // allow trusted server-side calls; block non-admin client calls (see pauseJobQueue).
    if (this.connection) {
      var user = Meteor.users.findOne(this.userId, {fields:{admin:1}});
      if (!user || !user.admin) {
        throw new Meteor.Error('not-authorized', 'Must be admin.');
      }
    }

    check(jobName, String);

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
