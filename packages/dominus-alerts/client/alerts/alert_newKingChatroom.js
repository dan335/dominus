var helpers = {
    title: function() {
        return 'Chatroom created for you and your vassals'
    },
}

Template.alert_newKingChatroom.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_newKingChatroom.events = alertSharedEvents
Template.alert_newKingChatroom.rendered = alertSharedRendered

Template.alert_newKingChatroom.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)
}
