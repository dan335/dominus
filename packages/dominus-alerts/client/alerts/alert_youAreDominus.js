var helpers = {
    title: function() {
        return 'You are now the Dominus.'
    },
}

Template.alert_youAreDominus.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_youAreDominus.events = alertSharedEvents
Template.alert_youAreDominus.rendered = alertSharedRendered

Template.alert_youAreDominus.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)
}
