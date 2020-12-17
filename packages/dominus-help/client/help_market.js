Template.help_market.helpers({
  gained_at_hex: function() {
    return _gs.villages(Session.get('gameId'), 'gained_at_hex') * _gs.villages(Session.get('gameId'), 'incomeInterval');
  },

  resources_at_large_hexes: function() {
    return _gs.villages(Session.get('gameId'), 'gained_at_hex') * _gs.villages(Session.get('gameId'), 'incomeInterval') * _s.villages.large_resource_multiplier;
  },

  income: function() {
    return _gs.castles(Session.get('gameId'), 'income');
  },

  incomeInterval: function() {
    return Math.round(_gs.castles(Session.get('gameId'), 'incomeInterval') / 1000 / 60);
  }
})
