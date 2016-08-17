// hexes and grid
Session.setDefault('hexes_pos', {x: 0, y: 0})	//	x,y that the svg hex group #hexes is translated to
Session.setDefault('canvas_size', undefined)
Session.setDefault('center_hex', undefined)	// the hex that is in the center of the screen
Session.setDefault('hexScale', undefined)

// set these to select something
// this is the only thing you need to do to select something
Session.setDefault('selected', null);

// used when selecting army path
Session.setDefault('finding_path_target_id', '')	// target that path goes to
Session.setDefault('finding_path_target_x', '')
Session.setDefault('finding_path_target_y', '')
Session.setDefault('finding_path_from_x', '')
Session.setDefault('finding_path_from_y', '')

Session.setDefault('is_dragging_hexes', false)

Session.setDefault('mouseOverHexCoords', null)	// what hex is the mouse over, used in send army panel
Session.setDefault('mouse_mode', 'default')	// used when selecting a hex to send army

Session.setDefault('rp_template', null);	// what to show in right panel


// true when the onscreen subscription is ready
// used to draw loading alert
Session.setDefault('subscription_ready', false)


Session.setDefault('show_building_castle_modal', false)
Session.setDefault('show_connection_lost_modal', false)

// refresh templates that use time
Meteor.setInterval(function() {
	Session.set('refresh_time_field', Random.fraction())
}, 1000 * 10)

Meteor.setInterval(function() {
	Session.set('refresh_time_field_every_sec', Random.fraction())
}, 1000 * 1)

Session.setDefault('num_villages', null)	// the number of villages that player has


// selected units reactive variable
// can't use reactive div, reactive div doesn't support objects
Meteor.startup(function() {
	var selected_units = {}
	var selected_units_dep = new Tracker.Dependency

	_.each(s.army.types, function(type) {
		selected_units[type] = 0
	})

	get_selected_units = function() {
		selected_units_dep.depend()
		return selected_units
	}

	get_selected_unit = function(type) {
		selected_units_dep.depend()
		return selected_units[type]
	}

	set_selected_unit = function(type, num) {
		if (selected_units[type] != num) {
			if (num >= 0) {
				selected_units[type] = num
				selected_units_dep.changed()
			}
		}
	}

	num_selected_units = function() {
		selected_units_dep.depend()
		var num = 0
		_.each(s.army.types, function(type) {
			num += selected_units[type]
		})
		return num
	};
});
