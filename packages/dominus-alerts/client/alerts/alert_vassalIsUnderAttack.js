var helpers = {
    battle: function() {
        if (this) {
            return Battles2.findOne(this.vars.battle_id)
        }
    },

    vassal: function() {
        return AlertUsers.findOne(this.vars.vassalPlayerId)
    },

    title: function() {
        var vassal = AlertUsers.findOne(this.vars.vassalPlayerId)
        if (vassal) {
            return 'Your vassal '+vassal.username+' is under attack.'
        }
    }
}


Template.alert_vassalIsUnderAttack.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_vassalIsUnderAttack.events = alertSharedEvents
Template.alert_vassalIsUnderAttack.rendered = alertSharedRendered


Template.alert_vassalIsUnderAttack.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)

    self.autorun(function() {
        if (Template.currentData()) {
            Meteor.subscribe('alertPlayer', Template.currentData().vars.vassalPlayerId)
            if (self.isOpen.get()) {
                Meteor.subscribe('battle', Template.currentData().vars.battle_id)
            }
        }
    })
}
