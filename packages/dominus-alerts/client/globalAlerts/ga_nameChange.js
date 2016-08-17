var helpers = {
    user: function() {
        return AlertUsers.findOne(this.vars.playerId)
    },

    title: function() {
        return this.vars.previousName +"'s new name is "+this.vars.newName
    }
}


Template.ga_nameChange.helpers(_.extend(globalAlertSharedHelpers, helpers))
Template.ga_nameChange.events = alertSharedEvents
Template.ga_nameChange.rendered = alertSharedRendered


Template.ga_nameChange.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)

    self.autorun(function() {
        if (Template.currentData()) {
            if (self.isOpen.get()) {
                Meteor.subscribe('alertPlayer', Template.currentData().vars.playerId)
            }
        }
    })
}
