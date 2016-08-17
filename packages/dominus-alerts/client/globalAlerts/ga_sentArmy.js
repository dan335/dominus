var helpers = {
    fromUser: function() {
        return AlertUsers.findOne(this.vars.fromPlayerId)
    },

    toUser: function() {
        return AlertUsers.findOne(this.vars.toPlayerId)
    },

    title: function() {
        var fromUser = AlertUsers.findOne(this.vars.fromPlayerId)
        var toUser = AlertUsers.findOne(this.vars.toPlayerId)
        if (toUser && fromUser) {
            return fromUser.username +' sent '+toUser.username+' an army.'
        }
    },

    numSoldiers: function() {
        var army = Template.parentData(1).vars.army
        return round_number(army[this])
    },

    hasSoldierType: function() {
        var army = Template.parentData(1).vars.army
        return army[this] > 0
    }
}


Template.ga_sentArmy.helpers(_.extend(globalAlertSharedHelpers, helpers))
Template.ga_sentArmy.events = alertSharedEvents
Template.ga_sentArmy.rendered = alertSharedRendered


Template.ga_sentArmy.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)

    self.autorun(function() {
        if (Template.currentData()) {
            Meteor.subscribe('alertPlayer', Template.currentData().vars.fromPlayerId)
            Meteor.subscribe('alertPlayer', Template.currentData().vars.toPlayerId)
        }
    })
}
