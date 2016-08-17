Meteor.publish('control_onlineUsers', function() {
  if (!this.userId) {
    return this.ready();
  }

  var user = Meteor.users.findOne(this.userId, {fields:{admin:1}});
  if (!user || !user.admin) {
    return this.ready();
  }

  return Meteor.users.find({'presence.status':'online'}, {}, {disableOplog:true});
});
