Meteor.methods({
  banUser: function(userId) {
    let callerUserId = Meteor.userId();
    let user = Meteor.users.findOne(callerUserId, {fields: {admin:1}});
    if (user && user.admin) {
      Meteor.users.update(userId, {$set: {banned:true}});
    }
  }
})
