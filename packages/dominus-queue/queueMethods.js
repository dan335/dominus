Meteor.methods({
  pauseJobQueue: async function() {
    // allow trusted server-side calls (this.connection === null, e.g. the
    // relationship-rebuild job that pauses the queue while it runs); block
    // client (DDP) calls from non-admins -- otherwise any player could freeze
    // battles/income/movement for every game on the server.
    if (this.connection) {
      var user = await Meteor.users.findOneAsync(this.userId, {fields:{admin:1}});
      if (!user || !user.admin) {
        throw new Meteor.Error('not-authorized', 'Must be admin.');
      }
    }

    // a pause from the admin panel is deliberate; the stuck-pause safety net leaves it alone
    await Queues.pauseAllAsync(!!this.connection);
  },


  resumeJobQueue: async function() {
    // allow trusted server-side calls; block non-admin client calls (see pauseJobQueue).
    if (this.connection) {
      var user = await Meteor.users.findOneAsync(this.userId, {fields:{admin:1}});
      if (!user || !user.admin) {
        throw new Meteor.Error('not-authorized', 'Must be admin.');
      }
    }

    await Queues.resumeAllAsync();
  },


  clearUniqueIdsForJob: async function(jobName) {
    // allow trusted server-side calls; block non-admin client calls (see pauseJobQueue).
    if (this.connection) {
      var user = await Meteor.users.findOneAsync(this.userId, {fields:{admin:1}});
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

    await Queues.clearUniqueIdsForJob(jobName);
  },

  runBullJob: async function(jobName, jobData) {
    check(jobName, String);
    check(jobData, Match.Any);
    var user = await Meteor.users.findOneAsync(this.userId, {fields:{admin:1}});
    if (!user || !user.admin) {
      throw new Meteor.Error('control.games.addGame', 'Must be admin.');
    }

    console.log('running job', jobName, jobData);
    await Queues.addAsync(jobName, jobData, {delay:0, timeout:1000*60*5}, false);
  }
});
