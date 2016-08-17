var helpers = {
    user: function() {
        return AlertUsers.findOne(this.vars.newDominusPlayerId)
    },

    title: function() {
        var user = AlertUsers.findOne(this.vars.newDominusPlayerId)
        if (user) {
            return user.username +' is now the Dominus.'
        }
    },

    previousDominus: function() {
        return AlertUsers.findOne(this.vars.previousDominusPlayerId)
    }
}


Template.ga_newDominus.helpers(_.extend(globalAlertSharedHelpers, helpers))
Template.ga_newDominus.events = alertSharedEvents
Template.ga_newDominus.rendered = alertSharedRendered


Template.ga_newDominus.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)

    self.autorun(function() {
        if (Template.currentData()) {
            Meteor.subscribe('alertPlayer', Template.currentData().vars.newDominusPlayerId)
            if (self.isOpen.get()) {
                Meteor.subscribe('alertPlayer', Template.currentData().vars.previousDominusPlayerId)
            }
        }
    })
}
