Template.landingSignin.events({
  'click #forgotPassLink': function(event, template) {
    event.preventDefault();
    var path = ($(event.currentTarget).attr('href'));
    SimpleRouter.go(path);
  },

  'click #signOutButton': function(event, template) {
    event.preventDefault();
    Meteor.logout();
  },

  'click #createaccountLink': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/createaccount');
  }
})
