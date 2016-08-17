Template.sharedGlobalAlert.helpers({
  alert: function() {
    return GlobalAlerts.findOne();
  },

  gameId: function() {
    return Session.get('gameId');
  }
})

Template.sharedGlobalAlert.events({
  'click #returnButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/game/'+Session.get('gameId'));
  }
})

Template.sharedGlobalAlert.rendered = function() {
  document.body.style.backgroundColor = '#333';
}

Template.sharedGlobalAlert.onCreated(function() {
  this.autorun(function() {
    var path = SimpleRouter.path.get();
    var pathArray = path.split('/');
    if (pathArray[4]) {
      Meteor.subscribe('globalAlert', pathArray[4]);
    }
  })
})
