var helpers = {
    chatroom: function() {
        return AlertChatrooms.findOne(this.vars.room_id)
    },

    title: function() {
        return 'You are now the owner of a chatroom.'
    },
}

Template.alert_chatroomNowOwner.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_chatroomNowOwner.events = alertSharedEvents
Template.alert_chatroomNowOwner.rendered = alertSharedRendered

Template.alert_chatroomNowOwner.created = function() {
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
