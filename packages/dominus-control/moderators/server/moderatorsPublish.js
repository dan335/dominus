Meteor.publish('control_moderators', async function() {
  if (!this.userId) {
    return this.ready();
  }

  var user = await Meteor.users.findOneAsync(this.userId, {fields:{admin:1}});
  if (!user || !user.admin) {
    return this.ready();
  }

  return Meteor.users.find({moderator:true}, {fields: {username:1, moderator:1}});
});
