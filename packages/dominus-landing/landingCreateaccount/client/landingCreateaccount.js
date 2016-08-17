Template.landingCreateaccount.events({
  'click #signOutButton': function(event, template) {
    event.preventDefault();
    Meteor.logout();
  },

  'click #signInLink': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/signin');
  }
})
