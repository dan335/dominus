// draw the outline for a hex
// size is a multiplier on the size of the outline
Template.registerHelper('hex_points', function(x, y, size) {
	var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish);
	return Hx.getHexPolygonVerts(grid.x, grid.y, _s.init.hexSize*size, _s.init.hexSquish)
});

Template.registerHelper('coord_to_pixel_x', function(x, y, offset) {
	check(x, Match.Integer);
	check(y, Match.Integer);
	check(offset, validNumber);
	var grid = Hx.coordinatesToPos(x, y, s.hex_size, s.hex_squish);
	return grid.x + offset;
})

Template.registerHelper('coord_to_pixel_y', function(x, y, offset) {
	check(x, Match.Integer);
	check(y, Match.Integer);
	check(offset, validNumber);
	var grid = Hx.coordinatesToPos(x, y, s.hex_size, s.hex_squish);
	return grid.y + offset;
})

Template.registerHelper('isPro', function() {
	let playerId = Session.get('playerId');
	if (playerId) {
		let player = Players.findOne(playerId, {fields: {pro:1}});
		if (player) {
			return player.pro;
		}
	}
	return false;
})

Template.registerHelper('capitalize', function(str) {
	return str.replace(/\w\S*/g, function(txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
})

Template.registerHelper('duration_shortDetailed', function(ms) {
	return dInit.duration_shortDetailed(ms);
});


Template.registerHelper('date_dateTime', function(jsDate) {
	Session.get('refresh_time_field')
	return moment(new Date(jsDate)).format('YYYY-MM-DD HH:mm');
});

Template.registerHelper('date_from_now', function(jsDate) {
	Session.get('refresh_time_field')
	return moment(new Date(jsDate)).fromNow()
})

Template.registerHelper('date_calendar', function(jsDate) {
	Session.get('refresh_time_field')
	return moment(new Date(jsDate)).calendar().toLowerCase();
})

Template.registerHelper('date_landingGames', function(jsDate) {
	Session.get('refresh_time_field')
	return moment(new Date(jsDate)).format('dddd M/D h:mma');
})

Template.registerHelper('relationship', function(playerId) {
	if (playerId) {
		return dInit.getRelationshipClient(playerId);
	}
});

Template.registerHelper('date_duration_humanize', function(ms) {
	return moment.duration(ms).humanize()
})

dInit.duration_shortDetailed = function(ms) {
	if (ms <= 0) {
		return 'soon';
	}

	var dur = moment.duration(ms);

  var ms = dur.milliseconds();
	var seconds = dur.seconds();
	var days = dur.days();
	var hours = dur.hours();
	var minutes = dur.minutes();

	var string = '';

  if (hours == 0 && days == 0 && minutes == 0 && seconds == 0) {
		string = '0s';
	}

	if (hours == 0 && days == 0 && seconds > 0) {
		string = seconds + 's';
	}

	if (minutes > 0) {
		string = minutes + 'm ' + string;
	}

	if (hours > 0) {
		string = hours + 'h ' + string;
	}

	if (days > 0) {
		string = days + 'd ' + string;
	}

	return string;
}
