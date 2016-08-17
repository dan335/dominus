if (Meteor.isServer) {

	if (process.env.NODE_ENV == 'development') {
		// cheats
		s.army_travel_multiplier = 0.000001;
		s.battle_check_interval = 1000 * 10;
		s.army_update_interval = 1000 * 2;	// how often does army movement job run
	} else {
		s.army_travel_multiplier = 1; 	// for debug, lower than one makes armies move faster
		s.battle_check_interval = 1000 * 10;
		s.army_update_interval = 1000 * 10;	// how often does army movement job run
	}



	s.village.construction_update_interval = 1000 * 30; 	// how often to check for building villages

	s.create_castle = {
		check_buildings_num_rings: 5,
		check_workers_army_num_rings: 3
	};

	s.market.start_price = {
		grain:10,
		lumber:10,
		ore:10,
		wool:10,
		clay:10,
		glass:10
	};

	// which image to use for hex
	// this is how many are available
	s.resource.numTileImages = {};
	s.resource.numTileImages.grain = 3;
	s.resource.numTileImages.lumber = 1;
	s.resource.numTileImages.ore = 1;
	s.resource.numTileImages.wool = 1;
	s.resource.numTileImages.clay = 1;
	s.resource.numTileImages.glass = 1;

	s.castle.starting_garrison = {
		footmen: 2,
		archers: 12,
		pikemen: 12,
		cavalry: 2,
		catapults: 0
	};

	s.castle.starting_image = 'castle_02_keep';

	// give to new user
	s.starting_resources = {
		gold: 10,
		grain: 500,
		lumber: 500,
		ore: 500,
		wool: 500,
		clay: 500,
		glass: 500
	};

	// how much time between dailystat ticks
	// in hours
	s.statsInverval = 6;

	statsBegin = function() {
		var currentHour = moment().hour();
		var beginHour = currentHour - (currentHour % s.statsInverval);
		return moment().startOf('day').add(beginHour, 'hours').toDate();
	};
	statsEnd = function() {
		var begin = moment(statsBegin());
		return begin.add(s.statsInverval, 'hours').toDate();
	};

	// in hours
	s.gamestatsInterval = 3;

	gamestatsBegin = function() {
		var currentHour = moment().hour();
		var beginHour = currentHour - (currentHour % s.gamestatsInterval);
		return moment().startOf('day').add(beginHour, 'hours').toDate();
	};
	gamestatsEnd = function() {
		var begin = moment(statsBegin());
		return begin.add(s.statsInverval, 'hours').toDate();
	};
}
