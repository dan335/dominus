Meteor.methods({
  addMod: async function(userId) {
    check(userId, String);
    let user = await Meteor.users.findOneAsync(this.userId, {fields: {admin:1}});
    if (user && user.admin) {
      await Meteor.users.updateAsync(userId, {$set: {moderator:true}});
    }
  }
});
