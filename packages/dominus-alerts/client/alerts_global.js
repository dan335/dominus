Template.alerts_global.helpers({
    alerts: function() {
        return GlobalAlerts.find({},{sort:{created_at:-1}})
    }
})


Template.alerts_global.events({
    'click #showMoreButton': function(event, template) {
      event.preventDefault();
      Template.instance().numShow.set(Template.instance().numShow.get() + 5)
    }
})


Template.alerts_global.onCreated(function() {
  var self = this;
  this.numShow = new ReactiveVar(10)

  this.autorun(function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      Meteor.subscribe('globalAlerts', gameId, self.numShow.get());
    }
  })
});
