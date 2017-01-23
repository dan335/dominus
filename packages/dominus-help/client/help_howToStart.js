Template.help_howToStart.helpers({
  sVillages: function() {
    return _s.villages;
  },

  max_can_have: function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      return _gs.villages(gameId, 'max_can_have');
    }
  }
})
