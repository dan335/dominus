var helpers = {
    battle: function() {
        if (this) {
            return Battles2.findOne(this.vars.battle_id)
        }
    },

    title: function() {
        return 'Your village was destroyed.'
    }
}


Template.alert_villageDestroyed.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_villageDestroyed.events = alertSharedEvents
Template.alert_villageDestroyed.rendered = alertSharedRendered


Template.alert_villageDestroyed.created = function() {
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
