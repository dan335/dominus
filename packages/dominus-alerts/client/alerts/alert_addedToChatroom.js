var helpers = {
    addedByUser: function() {
        return AlertUsers.findOne(this.vars.addedByPlayerId)
    },

    chatroom: function() {
        return AlertChatrooms.findOne(this.vars.room_id)
    },

    title: function() {
        var user = AlertUsers.findOne(this.vars.addedByPlayerId)
        if (user) {
            return user.username+' added you to a chatroom.'
        } else {
            return 'You were added you to a chatroom.'
        }
    },
}

Template.alert_addedToChatroom.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_addedToChatroom.events = alertSharedEvents
Template.alert_addedToChatroom.rendered = alertSharedRendered

Template.alert_addedToChatroom.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)

    self.autorun(function() {
        if (Template.currentData()) {
            if (self.isOpen.get()) {
                Meteor.subscribe('alertChatroom', Template.currentData().vars.room_id)
            }
            Meteor.subscribe('alertPlayer', Template.currentData().vars.addedByPlayerId)
        }
    })
}
