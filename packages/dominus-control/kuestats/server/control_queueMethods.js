Meteor.methods({
  resetQueueStats: async function() {
    var user = await Meteor.users.findOneAsync(this.userId, {fields:{admin:1}});
    if (!user || !user.admin) {
      throw new Meteor.Error('control.resetQueueStats', 'Must be admin.');
    }

    await Queues.addAsyncOrLog('resetQueueStats', {}, {delay:0, timeout:1000*60*5}, false);
  }
})
