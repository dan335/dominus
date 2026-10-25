Meteor.publish('kuestats', async function() {
  if (!this.userId) {
    return this.ready();
  }

  var user = await Meteor.users.findOneAsync(this.userId, {fields:{admin:1}});
  if (!user || !user.admin) {
    return this.ready();
  }

  return KueStats.find();
})


Meteor.publish('jobworkstats', async function() {
  if (!this.userId) {
    return this.ready();
  }

  var user = await Meteor.users.findOneAsync(this.userId, {fields:{admin:1}});
  if (!user || !user.admin) {
    return this.ready();
  }

  return JobWorkStats.find();
})
