// helpers that are used everywhere
// needs to be cleaned up


Template.registerHelper('s.hex_size', function() { return s.hex_size })


Template.registerHelper('grid_x', function() { return Session.get('hexes_pos').x })
Template.registerHelper('grid_y', function() { return Session.get('hexes_pos').y })
Template.registerHelper('negative_grid_x', function() { return Session.get('hexes_pos').x * -1 })	// used for fog
Template.registerHelper('negative_grid_y', function() { return Session.get('hexes_pos').y * -1 })
Template.registerHelper('canvas_width', function() {
	var canvasSize = Session.get('canvas_size')
	if (canvasSize) {
		return canvasSize.width
	}
})
Template.registerHelper('canvas_height', function() {
	var canvasSize = Session.get('canvas_size')
	if (canvasSize) {
		return canvasSize.height
	}
})
Template.registerHelper('half_canvas_width', function() {
	var canvasSize = Session.get('canvas_size')
	if (canvasSize) {
		return canvasSize.width/2
	}
})
UI.registerHelper('half_canvas_height', function() {
	var canvasSize = Session.get('canvas_size')
	if (canvasSize) {
		return canvasSize.half_height
	}
})

Template.registerHelper('vassal_tax', function() {
	return s.vassal_tax * 100
})

Template.registerHelper('resource_interval', function() {
	return moment.duration(s.resource.interval).humanize()
})

Template.registerHelper('s_battle_interval', function() {
	let interval = _gs.battles(Session.get('gameId'), 'battleInterval');
	return moment.duration(interval).humanize()
})

Template.registerHelper('resources_at_large_hexes', function() {
	return _s.villages.large_resource_multiplier * _gs.villages(Session.get('gameId'), 'gained_at_hex') * _gs.villages(Session.get('gameId'), 'incomeInterval');
	//return s.resource.large_resource_multiplier * s.resource.gained_at_hex
})
