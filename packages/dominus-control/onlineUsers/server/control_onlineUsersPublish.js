Meteor.publish('control_onlineUsers', async function() {
  if (!this.userId) {
    return this.ready();
  }

  var user = await Meteor.users.findOneAsync(this.userId, {fields:{admin:1, moderator:1}});
  if (!user) {
    return this.ready();
  }

  if (!user.admin && !user.moderator) {
    return this.ready();
  }

  return Meteor.users.find({'presence.status':'online'}, {fields: {username:1, presence:1, pro:1}});
});
