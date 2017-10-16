_gs.graphs = function(gameId, path) {

  let game = _gs.getGame(gameId);
  let settings = EJSON.clone(_s.graphs);

  if (game.isLazy) {
    settings.statsInverval = 9;
  }

  if (game.isSpeed) {
		settings.statsInverval = 3;
  }

  if (game.isSuperSpeed) {
		settings.statsInverval = 0.5;
  }

  // cheats
  if (Meteor.settings.public.dominusIsDev) {
  }

  return objectValueFromString(settings, path);
}

_gs.statsBegin = function(gameId) {
	var currentHour = moment().hour();
	var beginHour = currentHour - (currentHour % _gs.graphs(gameId, 'statsInverval'));
	return moment().startOf('day').add(beginHour, 'hours').toDate();
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
