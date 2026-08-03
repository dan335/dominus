// Footer links route client side, the same way the top nav does.
// The href attributes are real paths so crawlers can still follow them.

Template.landingFooter.events({
  'click .footerLink': function(event, template) {
    event.preventDefault();
    SimpleRouter.go($(event.currentTarget).attr('href'));
  }
})
