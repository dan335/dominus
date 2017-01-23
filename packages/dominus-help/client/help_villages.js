Template.help_villages.helpers({
  sVillages: function() {
    return _s.villages;
  },

  incomeInterval: function() {
    return _gs.villages(Session.get('gameId'), 'incomeInterval');
  },

  maxVillages: function() {
    return _gs.villages(Session.get('gameId'), 'max_can_have');
  }
})
