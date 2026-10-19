Template.noPlayerFound.helpers({
  // spectators see the spectatorBanner instead
  show: function() {
    let mode = Session.get('gameViewMode');
    return mode == 'loading' || mode == 'joining';
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
