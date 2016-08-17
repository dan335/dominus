var helpers = {
  title: function() {
    return 'You captured a country.';
  },

  capital: function() {
    return AlertCapitals.findOne(this.vars.capital_id);
  }
}

Template.alert_capturedCapital.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_capturedCapital.events = alertSharedEvents
Template.alert_capturedCapital.rendered = alertSharedRendered

Template.alert_capturedCapital.created = function() {
  var self = this

  self.isOpen = new ReactiveVar(false)

  self.autorun(function() {
    if (Template.currentData()) {
      if (self.isOpen.get()) {
        Meteor.subscribe('alertCapital', Template.currentData().vars.capital_id)
      }
    }
  })
}
