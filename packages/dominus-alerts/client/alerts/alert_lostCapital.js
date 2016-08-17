var helpers = {
  title: function() {
    return 'You lost a country.';
  },

  capital: function() {
    return AlertCapitals.findOne(this.vars.capitalId);
  }
}

Template.alert_lostCapital.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_lostCapital.events = alertSharedEvents
Template.alert_lostCapital.rendered = alertSharedRendered

Template.alert_lostCapital.created = function() {
  var self = this

  self.isOpen = new ReactiveVar(false)

  self.autorun(function() {
    if (Template.currentData()) {
      if (self.isOpen.get()) {
        Meteor.subscribe('alertCapital', Template.currentData().vars.capitalId);
      }
    }
  })
}
