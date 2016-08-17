Template.connection_lost_alert.helpers({
    show: function() {
        return !Meteor.status().connected
    },

    status: function() {
        return Meteor.status()
    },

    isConnecting: function() {
        return Meteor.status().status == 'connecting'
    },

    isFailed: function() {
        return Meteor.status().status == 'failed'
    },

    isWaiting: function() {
        return Meteor.status().status == 'waiting'
    },

    isOffline: function() {
        return Meteor.status().status == 'offline'
    },

    retryTime: function() {
        Session.get('refresh_time_field_every_sec')
        if (Meteor.status().status == 'waiting') {
            return Math.round((Meteor.status().retryTime - (new Date()).getTime())/1000)
        }
    }
})
