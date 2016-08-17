Template.noPlayerFound.helpers({
  show: function() {
    let playerId = Session.get('playerId');
    return !playerId;
  },

  gameId: function() {
    return Session.get('gameId');
  }
});


Template.noPlayerFound.events({
  'click #noPlayerJoinGameLink': function(event, template) {
    event.preventDefault();
    let gameId = Session.get('gameId');
    SimpleRouter.go('/game/'+gameId+'/join');
  }
})
