_gs.villages = function(gameId, path) {

  let game = _gs.getGame(gameId);
  let settings = EJSON.clone(_s.villages);

  // ---------
  // game specific settings
  if (game && game.isLazy) {
    settings.max_can_have = 6;
    settings.gained_at_hex = 0.000005;

    settings.cost.level1.timeToBuild = _s.villages.cost.level1.timeToBuild * 1.2
    settings.cost.level2.timeToBuild = _s.villages.cost.level2.timeToBuild * 1.2
    settings.cost.level3.timeToBuild = _s.villages.cost.level3.timeToBuild * 1.2
  }

  if (game && game.isSpeed) {
    settings.max_can_have = 6;
    settings.gained_at_hex = 0.00001333333333;

    settings.cost.level1.timeToBuild = _s.villages.cost.level1.timeToBuild / 3
    settings.cost.level2.timeToBuild = _s.villages.cost.level2.timeToBuild / 3
    settings.cost.level3.timeToBuild = _s.villages.cost.level3.timeToBuild / 3
  }

  if (game && game.isSuperSpeed) {
    settings.max_can_have = 8;
    settings.gained_at_hex = 0.0001;

    settings.cost.level1.timeToBuild = _s.villages.cost.level1.timeToBuild / 20
    settings.cost.level2.timeToBuild = _s.villages.cost.level2.timeToBuild / 20
    settings.cost.level3.timeToBuild = _s.villages.cost.level3.timeToBuild / 20

    settings.incomeInterval = 1000 * 60 * 10;
  }

  // cheats
  if (Meteor.settings.public.dominusIsDev) {
    settings.cost.level1.timeToBuild = 1000;
    settings.cost.level2.timeToBuild = 1000;
    settings.cost.level3.timeToBuild = 1000;
    settings.incomeInterval = 1000 * 60;
    settings.gained_at_hex = 0.001;
  }

  return objectValueFromString(settings, path);
}



_s.villages = {
  defense_bonus: 2,
  ally_defense_bonus: 1.5,
  maxLevel: 3,
  max_can_have: 5,
  gold_gained_at_village: 0,
  num_rings_village: 1,   // villages collect resources from this many rings
  gained_at_hex: 0.000005,       // how many resources are gained from each hex per ms
  large_resource_multiplier: 2,   // large resource hex multiplier
  //constructionUpdateInterval: 1000 * 30, 	// how often to check for building villages
  incomeInterval: 1000 * 60 * 20,

  cost: {
  	level1: {
  		grain: 200,
  		lumber: 200,
  		ore: 200,
  		wool: 200,
  		clay: 200,
  		glass: 200,
  		timeToBuild: 1000 * 60 * 30	// 30 min
  	},
  	level2: {
  		grain: 20,
  		lumber: 20,
  		ore: 20,
  		wool: 20,
  		clay: 20,
  		glass: 20,
  		timeToBuild: 1000 * 60 * 60 * 4	// 4 hours
  	},
  	level3: {
  		grain: 20,
  		lumber: 20,
  		ore: 20,
  		wool: 20,
  		clay: 20,
  		glass: 20,
  		timeToBuild: 1000 * 60 * 60 * 8 // 8 hours
  	},
  },

  names: {
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
  }
}
