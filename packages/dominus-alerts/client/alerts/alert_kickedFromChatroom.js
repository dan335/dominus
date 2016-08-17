var helpers = {
    chatroom: function() {
        return AlertChatrooms.findOne(this.vars.room_id)
    },

    title: function() {
        return 'You were kicked out of a chatroom.'
    },
}

Template.alert_kickedFromChatroom.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_kickedFromChatroom.events = alertSharedEvents
Template.alert_kickedFromChatroom.rendered = alertSharedRendered

Template.alert_kickedFromChatroom.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)

    self.autorun(function() {
        if (Template.currentData()) {
            if (self.isOpen.get()) {
                Meteor.subscribe('alertChatroom', Template.currentData().vars.room_id)
            }
        }
    })
}
