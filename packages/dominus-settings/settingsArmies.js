_gs.armies = function(gameId, path) {

  let game = _gs.getGame(gameId);
  let settings = EJSON.clone(_s.armies);

  if (game.isSpeed) {
    settings.stats.footmen.speed = Math.round(settings.stats.footmen.speed * 6);
    settings.stats.archers.speed = Math.round(settings.stats.archers.speed * 6);
    settings.stats.pikemen.speed = Math.round(settings.stats.pikemen.speed * 6);
    settings.stats.cavalry.speed = Math.round(settings.stats.cavalry.speed * 6);
    settings.stats.catapults.speed = Math.round(settings.stats.catapults.speed * 6);
  }

  if (game.isSuperSpeed) {
    settings.stats.footmen.speed = Math.round(settings.stats.footmen.speed * 18);
    settings.stats.archers.speed = Math.round(settings.stats.archers.speed * 18);
    settings.stats.pikemen.speed = Math.round(settings.stats.pikemen.speed * 18);
    settings.stats.cavalry.speed = Math.round(settings.stats.cavalry.speed * 18);
    settings.stats.catapults.speed = Math.round(settings.stats.catapults.speed * 18);
  }

  // cheats
  if (Meteor.settings.public.dominusIsDev) {
    //settings.armyTravelMultiplier = 0.1; // this breaks tests TODO: make meteor settings variable isTest
  }

  return objectValueFromString(settings, path);
}



_s.armies = {
  types: ['footmen', 'archers', 'pikemen', 'cavalry', 'catapults'],
  jobUpdateInterval: 1000 * 4,
  armyTravelMultiplier: 1,
  mapObjectOffsetX: 12,
  mapObjectOffsetY: 30,
  mapObjectHighlightRadius: 14,
  maxPaths: 8,
  maxMoveHexDistance: 40,

  cost: {
  	footmen: {
  		grain: 18,
  		lumber: 0,
  		ore: 100,
  		wool: 0,
  		clay: 0,
  		glass: 0,
  	},
  	archers: {
  		grain: 18,
  		lumber: 100,
  		ore: 0,
  		wool: 0,
  		clay: 0,
  		glass: 0,
  	},
  	pikemen: {
  		grain: 18,
  		lumber: 0,
  		ore: 0,
  		wool: 0,
  		clay: 100,
  		glass: 0,
  	},
  	cavalry: {
  		grain: 18,
  		lumber: 0,
  		ore: 0,
  		wool: 100,
  		clay: 0,
  		glass: 0,
  	},
  	catapults: {
  		grain:18,
  		lumber:0,
  		ore:0,
  		wool:0,
  		clay:0,
  		glass:100
  	}
  },

  stats: {
    footmen: {
  		offense: 13,
  		defense: 13,
  		speed: 10
  	},
  	archers: {
  		offense: 5,
  		defense: 15,
  		speed: 14
  	},
  	pikemen: {
  		offense: 2,
  		defense: 17,
  		speed: 8
  	},
  	cavalry: {
  		offense: 13,
  		defense: 5,
  		speed: 22
  	},
  	catapults: {
  		offense: 1,
  		defense: 1,
  		speed: 4,
  		bonus_against_buildings: 30
  	}
  },

  names: {
    part1: [
    'Alpha',
    'Iron',
    'Night',
    'Thousand',
    'Black',
    'Savage',
    'Wolf',
    'Royal',
    'Righteous',
    'Bravo',
    'Dark',
    'Cintus',
    'Quattuor',
    'Septem',
    'Octo',
    'Novem',
    'Tredecim',
    'Viginti',
    'Albus',
    'Hard'
    ],
    part2: [
    'Sons',
    'Warriors',
    'Eaters',
    'Lords',
    'Legion',
    'Avengers',
    'Brigade',
    'Division',
    'Irons',
    'Company',
    'Bears',
    'Swords',
    'Sentinels',
    'Spears',
    'Spartans'
    ]
  }
}

_s.armies.pastMovesToShow = 3;
// s.army.pastMovesToShow times as long as catapults
_s.armies.pastMovesMsLimit = 60 / _s.armies.stats.catapults.speed * _s.armies.pastMovesToShow * 1000 * 60;
