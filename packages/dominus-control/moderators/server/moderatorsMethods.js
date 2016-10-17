Meteor.methods({
  addMod: function(userId) {
    let user = Meteor.users.findOne(this.userId, {fields: {admin:1}});
    if (user && user.admin) {
      Meteor.users.update(userId, {$set: {moderator:true}});
    }
  }
});
