_gs.init = function(gameId, path) {
  let game = _gs.getGame(gameId);

  let settings = EJSON.clone(_s.init);

  // ---------
  // game specific settings
  if (game && game.isCrazyFast) {
    settings.time_til_game_end_when_new_dominus = 1000 * 60 * 60 * 1;

    settings.startingResources = {
  		gold: 10000,
  		grain: 1500,
  		lumber: 2000,
  		ore: 1500,
  		wool: 1500,
  		clay: 2000,
  		glass: 1500
  	}
  }

  // cheats
  if (Meteor.isServer && process.env.NODE_ENV == 'development') {
    settings.resourceInterval = 1000 * 60;
  }

  return objectValueFromString(settings, path);
}


_s.init = {
  hexSize: 60,
  hexSquish: 0.7,
  hexScaleMax: 1,
	hexScaleMin: 0.5,
  resourceInterval: 1000 * 60 * 10, // old
  version: '0.0.23',
  relationshipTypes: [
    'mine',
    'king',
    'direct_lord',
    'lord',
    'direct_vassal',
    'vassal',
    'enemy_ally',
    'enemy'
  ],

  // give to new player
	startingResources: {
		gold: 10,
		grain: 500,
		lumber: 500,
		ore: 500,
		wool: 500,
		clay: 500,
		glass: 500
	},

  // how long after the game ends do we show the game over popup
  // after this time expires the game closes login and resets
  gameOverPhaseTime: 1000 * 60 * 60 * 24, 	// 24 hours

  // how long after the game is over and resets does it wait before starting a new game
  // this gives me time to update code and send out a newsletter
  // this also lets people know when a new game will start on the landing page
  gameClosedPhaseTime: 1000 * 60 * 60 * 48, 	// 48 hours

  // how often can users report someone
  // once every
  canReportEvery: 1000 * 60 * 60 * 24,	// a day
  reportCheckInterval: 1000 * 30,

  // length of time added to game end clock when there is a new dominus
  time_til_game_end_when_new_dominus: 1000 * 60 * 60 * 24 * 2
}



// in hours
_s.init.gamestatsInterval = 3;

_s.init.gamestatsBegin = function() {
  var currentHour = moment().hour();
  var beginHour = currentHour - (currentHour % _s.init.gamestatsInterval);
  return moment().startOf('day').add(beginHour, 'hours').toDate();
};
_s.init.gamestatsEnd = function() {
  var begin = moment(statsBegin());
  return begin.add(_s.init.statsInverval, 'hours').toDate();
};
