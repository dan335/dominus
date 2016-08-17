Template.landingDeleteAccount.events({
  'click #deleteAccountButton': function(event,template) {
    event.preventDefault();

    var button = template.find('#deleteAccountButton')

    $(button).attr('disabled', true);
    $(button).html('Please Wait');

    Meteor.call('deleteEntireAccount', function(error, result) {
      if (error) {
        console.error(error);
      }

      SimpleRouter.go('/');
    })
  },

  'click #cancelButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/settings');
  }
})
