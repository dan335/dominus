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
      return fromUser.username +' sent '+round_number(this.vars.amount)+' gold to '+toUser.username
    }
  }
}


Template.ga_sentGold.helpers(_.extend(globalAlertSharedHelpers, helpers))
Template.ga_sentGold.events = globalAlertSharedEvents
Template.ga_sentGold.rendered = alertSharedRendered


Template.ga_sentGold.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)

    self.autorun(function() {
        if (Template.currentData()) {
            Meteor.subscribe('alertPlayer', Template.currentData().vars.fromPlayerId)
            Meteor.subscribe('alertPlayer', Template.currentData().vars.toPlayerId)
        }
    })
}
