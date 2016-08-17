var helpers = {
    title: function() {
        return 'Your army finished moving.'
    },

    army: function() {
        if (this) {
            return AlertArmies.findOne(this.vars.army_id)
        }
    },

    joinedCastle: function() {
        return AlertCastles.findOne(this.vars.joinedCastle)
    },

    joinedVillage: function() {
        return AlertVillages.findOne(this.vars.joinedVillage)
    },

    joinedArmy: function() {
        return AlertArmies.findOne(this.vars.joinedArmy)
    },
}

Template.alert_armyFinishedAllMoves.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_armyFinishedAllMoves.events = alertSharedEvents
Template.alert_armyFinishedAllMoves.rendered = alertSharedRendered

Template.alert_armyFinishedAllMoves.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)

    self.autorun(function() {
        if (Template.currentData()) {
            if (self.isOpen.get()) {
                Meteor.subscribe('alertArmy', Template.currentData().vars.army_id)

                if (Template.currentData().vars.joinedCastle) {
                    Meteor.subscribe('alertCastle', Template.currentData().vars.joinedCastle)
                }

                if (Template.currentData().vars.joinedVillage) {
                    Meteor.subscribe('alertVillage', Template.currentData().vars.joinedVillage)
                }

                if (Template.currentData().vars.joinedArmy) {
                    Meteor.subscribe('alertArmy', Template.currentData().vars.joinedArmy)
                }
            }
        }
    })
}
