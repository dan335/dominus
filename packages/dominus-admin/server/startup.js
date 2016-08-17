Facts.setUserIdFilter(function (userId) {
    var user = Meteor.users.findOne(userId);
    return user && user.admin;
})
