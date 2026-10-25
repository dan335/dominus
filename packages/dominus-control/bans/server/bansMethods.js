Meteor.methods({
  banUser: async function(userId, reason) {
    check(userId, String);
    check(reason, String);
    var user = await Meteor.users.findOneAsync(this.userId, {fields:{admin:1, moderator:1}});
    if (user) {
      if (!user.admin && !user.moderator) {
        throw new Meteor.Error('control.games.addGame', 'Must be admin or moderator.');
      }
    } else {
      throw new Meteor.Error('control.games.addGame', 'Must be admin or moderator.');
    }

    await Meteor.users.updateAsync(userId, {$set: {banned:true, reason:reason, bannedBy:user._id, bannedDate:new Date()}});
  },



  unbanUser: async function(userId) {
    check(userId, String);
    var user = await Meteor.users.findOneAsync(this.userId, {fields:{admin:1, moderator:1}});
    if (user) {
      if (!user.admin && !user.moderator) {
        throw new Meteor.Error('control.games.addGame', 'Must be admin or moderator.');
      }
    } else {
      throw new Meteor.Error('control.games.addGame', 'Must be admin or moderator.');
    }

    await Meteor.users.updateAsync(userId, {$set: {banned:false}});
  }
});
