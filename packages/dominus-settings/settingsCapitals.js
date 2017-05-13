_gs.capitals = function(gameId, path) {

  let game = _gs.getGame(gameId);
  let settings = EJSON.clone(_s.capitals);

  // ---------
  // game specific settings

  if (game && game.isSpeed) {
  }

  if (game && game.isSuperSpeed) {
    settings.income = {
      gold: 0,
      grain: 80,
      lumber: 80,
      ore: 80,
      wool: 80,
      clay: 80,
      glass: 80
    }

    settings.startingGarrison = {
      footmen: 24,
      archers: 24,
      pikemen: 24,
      cavalry: 0,
      catapults: 0
    }    

    settings.incomeInterval = 1000 * 60 * 10;
    settings.villagePercentageIncome = 0.12;
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
    grain: 8,
    lumber: 8,
    ore: 8,
    wool: 8,
    clay: 8,
    glass: 8
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
