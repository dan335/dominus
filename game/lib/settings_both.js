// both client and server
s = {};
s.market = {};
s.resource = {};
s.army = {};
s.village = {};
s.castle = {};
s.rankings = {};

if (Meteor.isServer && process.env.NODE_ENV == 'development') {
	// cheats
	s.resource.interval = 1000 * 30;
	s.battle_interval = 1000 * 30;

} else {
	s.resource.interval = 1000 * 60 * 10;
	s.battle_interval = 1000 * 60 * 4;
}



s.hex_size = 60;
s.hex_squish = 0.7;

s.pro = {
	thisGame: {
		amountInCents: 200,
		priceString: '2.00',
		words: 'this game'
	},
	allGames: {
		amountInCents: 1200,
		priceString: '12.00',
		words: 'all games'
	}
};

// winner loses x percent of s.battle_dead_per_round_lose or x percent of soldiers in enemy armies
// double so that when attacking a castle you lost about the same amount as the castle
s.battle_power_lost_per_round = 500;
s.battle_power_lost_winner_ratio = 0.4;

// removal of inactives
s.inactives = {
	deleteCutoff: {
		unverifiedEmail: 1000 * 60 * 60 * 24 * 2,	// 2 days
		noVillagesOrVassals: 1000 * 60 * 60 * 24 * 2, 	// 2 days
		everyoneElse: 1000 * 60 * 60 * 24 * 10 	// 10 days
	},
	reminderCutoff: {
		unverifiedEmail: 1000 * 60 * 60 * 24 * 1,	// 1 day
		noVillagesOrVassals: 1000 * 60 * 60 * 24 * 1, 	// 1 day
		everyoneElse: 1000 * 60 * 60 * 24 * 9 	// 9 days
	},
	deleteUnverifiedEmails: true,
	deleteNoVillagesOrVassals: false,
	deleteEveryoneElse: true
};

//s.vassal_tax = 0.25		// percentage of income that goes to lord


s.sendToVassalTax = 0.2;

s.resource.gained_at_hex = 3;
s.resource.gold_gained_at_village = 0;
s.resource.num_rings_village = 1;
s.resource.large_resource_multiplier = 3; 	// large resource hexes give you x times as much

s.resource.types = ['grain', 'lumber', 'ore', 'wool', 'clay', 'glass'];
s.resource.types_plus_gold = ['gold'].concat(s.resource.types);

s.army.types = ['footmen', 'archers', 'pikemen', 'cavalry', 'catapults'];

s.army.unitBonusMultiplier = 1.5;

s.army.cost = {
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
};

s.army.stats = {
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
		speed: 5,
		bonus_against_buildings: 30
	}
};


s.army.pastMovesToShow = 3;
// s.army.pastMovesToShow times as long as catapults
s.army.pastMovesMsLimit = 60 / s.army.stats.catapults.speed * s.army.pastMovesToShow * 1000 * 60;

s.village.maxLevel = 3;

s.village.cost = {
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
		grain: 400,
		lumber: 400,
		ore: 400,
		wool: 400,
		clay: 400,
		glass: 400,
		timeToBuild: 1000 * 60 * 60 * 4	// 6 hours
	},
	level3: {
		grain: 600,
		lumber: 600,
		ore: 600,
		wool: 600,
		clay: 600,
		glass: 600,
		timeToBuild: 1000 * 60 * 60 * 8 // 24 hours
	},
};

// cheats for local
if (Meteor.isServer && process.env.NODE_ENV == 'development') {
	s.village.cost.level1.timeToBuild = 1000;
	s.village.cost.level2.timeToBuild = 1000;
	s.village.cost.level3.timeToBuild = 1000;
}


s.village.defense_bonus = 1.75;
s.castle.defense_bonus = 2;
s.village.ally_defense_bonus = 1.5;
s.castle.ally_defense_bonus = 1.5;


s.income = {};
s.income.percentToLords = 0.06;
s.income.maxToLords = 0.3;



// how often can users report someone
// once every
s.canReportEvery = 1000 * 60 * 60 * 24;	// a day
s.reportCheckInterval = 1000 * 30;

// how long does timeout last
reportDuration = function(numReports) {
	return 1000 * 60 * 20 * numReports * numReports;
};


s.markers = {}
s.markers.max = 25;
s.markers.maxGroups = 10;
