Template.help_capitals.helpers({
  _s: function() {
    return _s;
  },

  incomeInterval: function() {
    return _gs.capitals(Session.get('gameId'), 'incomeInterval');
  },

  income: function() {
    return _gs.capitals(Session.get('gameId'), 'income');
  },

  villagePercentageIncome: function() {
    return _gs.capitals(Session.get('gameId'), 'villagePercentageIncome');
  }
  
})
