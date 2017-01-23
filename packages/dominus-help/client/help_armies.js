Template.help_armies.helpers({
  bonusAmount: function() {
    return _s.battles.unitBonusMultiplier;
  },

  sCastles: function() {
    return _s.castles;
  },

  exampleCavResult: function() {
    let base = _s.armies.stats.cavalry.offense * 2;
    return base + base * _s.battles.unitBonusMultiplier * 0.5;
  },

  exampleOtherResult: function() {
    let basePike = _s.armies.stats.pikemen.defense;
    let finalArch = _s.armies.stats.archers.defense;
    let finalPike = basePike + basePike * _s.battles.unitBonusMultiplier;
    return finalPike + finalArch;
  },

  stats: function() {
    return _gs.armies(Session.get('gameId'), 'stats');
  }
})
