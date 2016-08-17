Template.alerts_mine.helpers({
    alerts: function() {
        return Alerts.find({},{sort:{created_at:-1}});
    }
});


Template.alerts_mine.events({
    'click #markAllAlertsAsReadButton': function(event, template) {
      event.preventDefault();
      Meteor.call('markAllAlertsAsRead', Session.get('playerId'));
    },

    'click #showMoreButton': function(event, template) {
      event.preventDefault();
      Template.instance().numShow.set(Template.instance().numShow.get() + 5);
    }
});


Template.alerts_mine.onCreated(function() {
    var self = this;

    this.numShow = new ReactiveVar(10);

    this.autorun(function() {
      var options = {fields:{hideAlertsMine:1}};
      let find = {userId:Meteor.userId(), gameId:Session.get('gameId')};
      var player = Players.findOne(find, options);
      if (player) {
        if (!player.hideAlertsMine) {
          player.hideAlertsMine = [];
        }

        Meteor.subscribe('myAlerts', player._id, self.numShow.get(), player.hideAlertsMine);
      }
    })
});
