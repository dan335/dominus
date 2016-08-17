var helpers = {
    battle: function() {
        if (this) {
            return Battles2.findOne(this.vars.battle_id)
        }
    },

    title: function() {
        return 'Your army was destroyed.'
    }
}


Template.alert_armyDestroyed.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_armyDestroyed.events = alertSharedEvents
Template.alert_armyDestroyed.rendered = alertSharedRendered


Template.alert_armyDestroyed.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)

    self.autorun(function() {
        if (Template.currentData()) {
            if (self.isOpen.get()) {
                Meteor.subscribe('battle', Template.currentData().vars.battle_id)
            }
        }
    })
}
