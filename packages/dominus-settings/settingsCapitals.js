_gs.capitals = function(gameId, path) {

  let game = _gs.getGame(gameId);
  let settings = EJSON.clone(_s.capitals);

  // ---------
  // game specific settings

  if (game && game.isSpeed) {
    settings.income = {
      gold: 0,
      grain: 20,
      lumber: 20,
      ore: 20,
      wool: 20,
      clay: 20,
      glass: 20
    }
  }

  if (game && game.isSuperSpeed) {
    settings.income = {
      gold: 0,
      grain: 100,
      lumber: 100,
      ore: 100,
      wool: 100,
      clay: 100,
      glass: 100
    }

    settings.incomeInterval = 1000 * 60 * 10;
  }

  // cheats
  if (Meteor.settings.public.dominusIsDev) {
    settings.incomeInterval = 1000 * 60;
  }

  return objectValueFromString(settings, path);
}

_s.capitals = {
  income: {   // base income at every capital
    gold: 0,
    grain: 10,
    lumber: 10,
    ore: 10,
    wool: 10,
    clay: 10,
    glass: 10
  },

  startingGarrison: {
    footmen: 20,
    archers: 20,
    cavalry: 0,
    pikemen: 20,
    catapults: 0
  },

  villagePercentageIncome: 0.1,    // percentage of village income that capitals get
  battleBonus: 1.5,
  incomeInterval: 1000 * 60 * 20,

  names: {
    part1: [
      'Limer',
      'Done',
      'Ferman',
      'Ros',
      'West',
      'Gal',
      'Cor',
      'Car',
      'Wex',
      'Arma',
      'Dur',
      'Nor',
      'Suf',
      'Ches',
      'Shrop',
      'Wilt',
      'Somer',
      'Corn',
      'Es',
      'Glos',
      'War'
    ],

    part2: [
      'ham',
      'land',
      'shire',
      'side',
      'tol',
      'set',
      'folk',
      'bria',
      'gal',
      'derry',
      'ick',
      'ford',
      'low',
      'lin',
      'way',
      'trim'
    ]
  }
};
