Template.lp_armies.helpers({
	armies: function() {
		return MyArmies.find({}, {sort: {name: 1}})
	},
})


Template.lp_army.helpers({

	unit_count: function() {
		var self = this
		var unit_count = 0
		_.each(s.army.types, function(type) {
			unit_count += self[type]
		})
		return unit_count
	},

	time_to_destination: function() {
		Session.get('refresh_time_field');
		var totalMs = 0;
		var first = true;
		var isPaused = false;
		var hasPath = false;
		var options = {fields: {paused:1, time:1}};
		var paths = Armypaths.find({armyId:this._id}, options).forEach(function(path) {
			totalMs += path.time;
			if (first) {
				isPaused = path.paused;
				first = false;
			}
			hasPath = true;
		});

		if (!hasPath) {
			return 0;
		}

		if (isPaused) {
			return totalMs;
		} else {
			var elapsedMs = moment() - moment(new Date(this.last_move_at));
			return totalMs - elapsedMs;
		}
	}
})
