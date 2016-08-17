var helpers = {
    title: function() {
        if (this) {
            return this.vars.username+' deleted their account.'
        }
    }
}


Template.ga_accountDeleted.helpers(_.extend(globalAlertSharedHelpers, helpers))
Template.ga_accountDeleted.events = alertSharedEvents
Template.ga_accountDeleted.rendered = alertSharedRendered


Template.ga_accountDeleted.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)
}
