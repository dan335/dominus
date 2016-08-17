Template.globalAlertShareLink.helpers({
  gameId: function() {
    return Session.get('gameId');
  }
});


Template.globalAlertShareLink.events({
  'click .globalAlertShareLink': function(event, template) {
    event.preventDefault();
    let gameId = Session.get('gameId');
    SimpleRouter.go('/game/'+gameId+'/alert/'+this._id);
  }
});
