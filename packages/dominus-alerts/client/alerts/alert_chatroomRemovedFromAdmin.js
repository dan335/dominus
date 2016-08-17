var helpers = {
    chatroom: function() {
        return AlertChatrooms.findOne(this.vars.room_id)
    },

    title: function() {
        return 'You are no longer an admin in a chatroom.'
    },
}

Template.alert_chatroomRemovedFromAdmin.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_chatroomRemovedFromAdmin.events = alertSharedEvents
Template.alert_chatroomRemovedFromAdmin.rendered = alertSharedRendered

Template.alert_chatroomRemovedFromAdmin.created = function() {
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
