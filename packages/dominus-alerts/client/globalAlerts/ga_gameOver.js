var helpers = {
    title: function() {
        return 'Game over.'
    },

    winner: function() {
        if (this) {
            return AlertUsers.findOne(this.vars.winnerPlayerId)
        }
    }
}


Template.ga_gameOver.helpers(_.extend(globalAlertSharedHelpers, helpers))
Template.ga_gameOver.events = alertSharedEvents
Template.ga_gameOver.rendered = alertSharedRendered


Template.ga_gameOver.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)

    self.autorun(function() {
        if (Template.currentData()) {
            if (self.isOpen.get()) {
                Meteor.subscribe('alertPlayer', Template.currentData().vars.winnerPlayerId)
            }
        }
    })
}
