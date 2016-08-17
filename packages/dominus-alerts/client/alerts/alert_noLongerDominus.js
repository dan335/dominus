var helpers = {
    title: function() {
        return 'You are no longer the Dominus.'
    },
}

Template.alert_noLongerDominus.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_noLongerDominus.events = alertSharedEvents
Template.alert_noLongerDominus.rendered = alertSharedRendered

Template.alert_noLongerDominus.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)
}
