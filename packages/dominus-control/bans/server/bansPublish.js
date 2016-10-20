Meteor.publish('control_bans', function() {
  if (!this.userId) {
    return this.ready();
  }

  var user = Meteor.users.findOne(this.userId, {fields:{admin:1, moderator:1}});
  if (!user) {
    return this.ready();
  }

  if (!user.admin && !user.moderator) {
    return this.ready();
  }

  return Meteor.users.find({banned:true}, {fields: {username:1, banned:1}});
});
