var helpers = {
    user: function() {
        return AlertUsers.findOne(this.vars.oldDominusPlayerId)
    },

    title: function() {
        var user = AlertUsers.findOne(this.vars.oldDominusPlayerId)
        if (user) {
            return user.username+' is no longer the Dominus.'
        }
    }
}


Template.ga_noLongerDominusNewUser.helpers(_.extend(globalAlertSharedHelpers, helpers))
Template.ga_noLongerDominusNewUser.events = alertSharedEvents
Template.ga_noLongerDominusNewUser.rendered = alertSharedRendered


Template.ga_noLongerDominusNewUser.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)

    self.autorun(function() {
        if (Template.currentData()) {
            Meteor.subscribe('alertPlayer', Template.currentData().vars.oldDominusPlayerId)
        }
    })
}
