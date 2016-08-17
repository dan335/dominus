var helpers = {
    fromUser: function() {
        return AlertUsers.findOne(this.vars.fromPlayerId)
    },

    title: function() {
        var user = AlertUsers.findOne(this.vars.fromPlayerId)
        if (user) {
            return user.username+' sent you an army.'
        } else {
            return 'Someone sent you an army.'
        }
    },

    numSoldiers: function() {
        var army = Template.parentData(1).vars.army
        return round_number(army[this])
    }
}

Template.alert_receivedArmy.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_receivedArmy.events = alertSharedEvents
Template.alert_receivedArmy.rendered = alertSharedRendered

Template.alert_receivedArmy.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)

    self.autorun(function() {
        if (Template.currentData()) {
            Meteor.subscribe('alertPlayer', Template.currentData().vars.fromPlayerId)
        }
    })
}
