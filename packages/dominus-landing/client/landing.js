Template.landing.events({
  'click #joinAGameButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/games');
  }
})
