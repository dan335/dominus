var helpers = {
    title: function() {
        if (this) {
            var vassal = AlertUsers.findOne(this.vars.lostVassalPlayerId)
            if (vassal) {
                return vassal.username+' is no longer your vassal.'
            } else {
                return "You've lost a vassal."
            }
        }
    },

    vassal: function() {
        return AlertUsers.findOne(this.vars.lostVassalPlayerId)
    },

    vassalsLord: function() {
        return AlertUsers.findOne(this.vars.vassalsNewLordPlayerId)
    }
}

Template.alert_lostVassal.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_lostVassal.events = alertSharedEvents
Template.alert_lostVassal.rendered = alertSharedRendered

Template.alert_lostVassal.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)

    self.autorun(function() {
        if (Template.currentData()) {
            if (self.isOpen.get()) {
                Meteor.subscribe('alertPlayer', Template.currentData().vars.vassalsNewLordPlayerId)
            }
            Meteor.subscribe('alertPlayer', Template.currentData().vars.lostVassalPlayerId)
        }
    })
}
