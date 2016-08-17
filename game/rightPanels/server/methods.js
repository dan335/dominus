Meteor.methods({
  daysSincePlayerActive: function(userId) {
    let options = {fields: {presence:1}};
    let user = Meteor.users.findOne(userId, options);
    if (user) {
      let date = null;
      if (user.presence && user.presence.status == 'online') {
        return 0;
      } else {
        date = new Date(user.presence.updatedAt);
      }

      var numDays = moment().diff(date, 'days');
      return Math.floor(numDays);
    }
    return null;
  }
});
