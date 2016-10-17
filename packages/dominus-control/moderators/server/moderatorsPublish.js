Meteor.publish('control_moderators', function() {
  if (!this.userId) {
    return this.ready();
  }

  var user = Meteor.users.findOne(this.userId, {fields:{admin:1}});
  if (!user || !user.admin) {
    return this.ready();
  }

  return Meteor.users.find({moderator:true}, {fields: {username:1, moderator:1}});
});
