var helpers = {
    title: function() {
        return 'You are no longer the Dominus.'
    },
}

Template.alert_noLongerDominusNewUser.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_noLongerDominusNewUser.events = alertSharedEvents
Template.alert_noLongerDominusNewUser.rendered = alertSharedRendered

Template.alert_noLongerDominusNewUser.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)
}
