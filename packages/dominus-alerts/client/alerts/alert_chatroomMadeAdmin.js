var helpers = {
    chatroom: function() {
        return AlertChatrooms.findOne(this.vars.room_id)
    },

    title: function() {
        return 'You are now an admin in a chatroom.'
    },
}

Template.alert_chatroomMadeAdmin.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_chatroomMadeAdmin.events = alertSharedEvents
Template.alert_chatroomMadeAdmin.rendered = alertSharedRendered

Template.alert_chatroomMadeAdmin.created = function() {
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
