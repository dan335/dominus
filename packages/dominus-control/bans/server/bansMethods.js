Meteor.methods({
  banUser: function(userId) {
    var user = Meteor.users.findOne(this.userId, {fields:{admin:1, moderator:1}});
    if (user) {
      if (!user.admin && !user.moderator) {
        throw new Meteor.Error('control.games.addGame', 'Must be admin or moderator.');
      }
    } else {
      throw new Meteor.Error('control.games.addGame', 'Must be admin or moderator.');
    }

    Meteor.users.update(userId, {$set: {banned:true}});
  },



  unbanUser: function(userId) {
    var user = Meteor.users.findOne(this.userId, {fields:{admin:1, moderator:1}});
    if (user) {
      if (!user.admin && !user.moderator) {
        throw new Meteor.Error('control.games.addGame', 'Must be admin or moderator.');
      }
    } else {
      throw new Meteor.Error('control.games.addGame', 'Must be admin or moderator.');
    }

    Meteor.users.update(userId, {$set: {banned:false}});
  }
});
