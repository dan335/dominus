Template.help_castles.helpers({
  sCastles: function() {
    return _s.castles;
  },

  collected: function() {
    return _gs.castles(Session.get('gameId'), 'income');
  },

  incomeInterval: function() {
    return _gs.castles(Session.get('gameId'), 'incomeInterval');
  }
})
