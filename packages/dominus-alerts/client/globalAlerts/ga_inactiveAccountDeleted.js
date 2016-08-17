var helpers = {
    title: function() {
        if (this) {
            return this.vars.username+"'s account was deleted because they were inactive."
        }
    }
}


Template.ga_inactiveAccountDeleted.helpers(_.extend(globalAlertSharedHelpers, helpers))
Template.ga_inactiveAccountDeleted.events = alertSharedEvents
Template.ga_inactiveAccountDeleted.rendered = alertSharedRendered


Template.ga_inactiveAccountDeleted.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)
}
