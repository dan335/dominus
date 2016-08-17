Template.landingForgotPassword.events({
  'click .landingLink': function(event, template) {
    event.preventDefault();
    var path = ($(event.currentTarget).attr('href'));
    SimpleRouter.go(path);
  },

  'click #signOutButton': function(event, template) {
    event.preventDefault();
    Meteor.logout();
  }
})
