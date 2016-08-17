_gs.castles = function(gameId, path) {

  let game = _gs.getGame(gameId);
  let settings = EJSON.clone(_s.castles);

  // ---------
  // game specific settings

  if (game && game.isSpeed) {
  }

  if (game && game.isSuperSpeed) {
    settings.income = {
      gold: 30,
      grain: 100,
    	lumber: 100,
    	ore: 100,
    	wool: 100,
    	clay: 100,
    	glass: 100
    }

    settings.startingGarrison = {
      footmen: 6,
      archers: 20,
      pikemen: 20,
      cavalry: 6,
      catapults: 0
    }

    settings.incomeInterval = 1000 * 60 * 10;
  }

  // cheats
  if (Meteor.settings.public.dominusIsDev) {
    settings.incomeInterval = 1000 * 60;
  }

  return objectValueFromString(settings, path);
}


_s.castles = {
  defense_bonus: 2,
  ally_defense_bonus: 1.5,

  startingImage: 'castle_02_keep',

  incomeInterval: 1000 * 60 * 20,

  startingGarrison: {
    footmen: 2,
    archers: 12,
    pikemen: 12,
    cavalry: 2,
    catapults: 0
  },

  income: {
    gold: 30,
    grain: 20,
  	lumber: 20,
  	ore: 20,
  	wool: 20,
  	clay: 20,
  	glass: 20
  }
}

_s.castles.names = {
  part1: [
  'Abing',
  'Act',
  'Als',
  'Ames',
  'Ash',
  'Ayls',
  'Ban',
  'Bart',
  'Beck',
  'Bed',
  'Bish',
  'Black',
  'Bod',
  'Brand',
  'Chart',
  'Chest',
  'Cinder',
  'Cor',
  'Dar',
  'Don',
  'Dron',
  'Durs',
  'Edmond',
  'Els',
  'Faring',
  'Felix',
  'Frod',
  'Glos',
  'Grim',
  'Har',
  'Hax',
  'Helms',
  'Hors',
  'Il',
  'Ketter',
  'Leek',
  'Long',
  'Lyn',
  'Malt',
  'Morse',
  'New',
  'Old',
  'Ponte',
  'Port',
  'Rich',
  'Saw',
  'Sax',
  'Skip',
  'Stone',
  'Walling'
  ], part2: [
  'shire',
  'folk',
  'land',
  'bria',
  'von',
  'set',
  'ton',
  'ham',
  'well',
  'ley',
  'wood',
  'lington',
  'borne',
  'field',
  'leigh',
  'don',
  'roe',
  'ley',
  'caster'
  ]
};
