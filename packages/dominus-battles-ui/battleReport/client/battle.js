Template.sharedBattle.helpers({
  battle: function() {
    return Battles2.findOne();
  },

  gameId: function() {
    return Session.get('gameId');
  }
});

Template.sharedBattle.events({
  'click #returnButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/game/'+Session.get('gameId'));
  }
});

Template.sharedBattle.onCreated(function() {
  this.autorun(function() {
    var path = SimpleRouter.path.get();
    var pathArray = path.split('/');
    if (pathArray[4]) {
      Meteor.subscribe('battle', pathArray[4]);
    }
  })
});

Template.sharedBattle.onRendered(function() {
  document.body.style.backgroundColor = '#333';
});
