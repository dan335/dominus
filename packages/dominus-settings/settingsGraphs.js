_gs.graphs = function(gameId, path) {

  let game = _gs.getGame(gameId);
  let settings = EJSON.clone(_s.graphs);

  if (game.isRelaxed) {
    settings.statsInverval = 9;
  }

  if (game.isSpeed) {
		settings.statsInverval = 3;
  }

  if (game.isCrazyFast) {
		settings.statsInverval = 0.5;
  }

  // cheats
  if (Meteor.settings.public.dominusIsDev) {
  }

  return objectValueFromString(settings, path);
}

// periods start on the hour in UTC, whatever the server's timezone, so a
// period is the same on every server and in the tests
_gs.statsBegin = function(gameId) {
	var currentHour = moment.utc(dClock.now()).hour();
	var beginHour = currentHour - (currentHour % _gs.graphs(gameId, 'statsInverval'));
	return moment.utc(dClock.now()).startOf('day').add(beginHour, 'hours').toDate();
},

_gs.statsEnd = function(gameId) {
	var begin = moment(_gs.statsBegin(gameId));
	return begin.add(_gs.graphs(gameId, 'statsInverval'), 'hours').toDate();
}




_s.graphs = {
  // how much time between dailystat ticks
	// in hours
	statsInverval: 6
}
