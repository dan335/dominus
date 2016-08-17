Meteor.methods({
  resetQueueStats: function() {
    var user = Meteor.users.findOne(this.userId, {fields:{admin:1}});
    if (!user || !user.admin) {
      throw new Meteor.Error('control.resetQueueStats', 'Must be admin.');
    }

    if (!this.isSimulation) {
      Queues.add('resetQueueStats', {}, {delay:0, timeout:1000*60*5}, false);
    }
  }
})
