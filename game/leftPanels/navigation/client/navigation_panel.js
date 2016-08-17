Template.navigation_panel.helpers({
	show_minimap: function() {
		let gameId = Session.get('gameId');
		let userId = Meteor.userId();
		let find = {gameId:gameId, userId:userId};
		let player = Players.findOne(find, {fields:{sp_show_minimap:1}});
		if (player) {
			return player.sp_show_minimap;
		} else {
			return true;
		}
	}
});


Template.navigation_panel.events({
	// grid movement
	'mousedown #move_grid_left_button': function(event, template) { template.moveLeft.set(true) },
	'mouseup #move_grid_left_button': function(event, template) { template.moveLeft.set(false) },
	'mouseleave #move_grid_left_button': function(event, template) { template.moveLeft.set(false) },

	'mousedown #move_grid_up_button': function(event, template) { template.moveUp.set(true) },
	'mouseup #move_grid_up_button': function(event, template) { template.moveUp.set(false) },
	'mouseleave #move_grid_up_button': function(event, template) { template.moveUp.set(false) },

	'mousedown #move_grid_right_button': function(event, template) { template.moveRight.set(true) },
	'mouseup #move_grid_right_button': function(event, template) { template.moveRight.set(false) },
	'mouseleave #move_grid_right_button': function(event, template) { template.moveRight.set(false) },

	'mousedown #move_grid_down_button': function(event, template) { template.moveDown.set(true) },
	'mouseup #move_grid_down_button': function(event, template) { template.moveDown.set(false) },
	'mouseleave #move_grid_down_button': function(event, template) { template.moveDown.set(false) },

	'click #move_grid_goto_button': function(event, template) {
		event.preventDefault();
		var x = Number($(template.find('#move_grid_x')).val())
		var y = Number($(template.find('#move_grid_y')).val())

		check(x, validNumber);
		check(y, validNumber);
		if (!isNaN(x) && !isNaN(y)) {
			Meteor.call('coords_to_id', x, y, 'hex', function(error, hexId) {
				if (!error && hexId) {
					SimpleRouter.go('/game/'+Session.get('gameId')+'/hex/'+x+'/'+y);
					dHexmap.centerOnHex(x, y);
				}
			});
		}
	},

	'click #increase_scale_button': function(event, template) {
		event.preventDefault();
		increase_hex_scale()
	},

	'click #decrease_scale_button':function(event, template) {
		event.preventDefault();
		decrease_hex_scale()
	},
})


Template.navigation_panel.created = function() {
	var self = this
	self.moveUp = new ReactiveVar(false)
	self.moveDown = new ReactiveVar(false)
	self.moveLeft = new ReactiveVar(false)
	self.moveRight = new ReactiveVar(false)
	self.gridMoveTimer = undefined
}

Template.navigation_panel.rendered = function() {
	var self = this

	// arrow keys to scroll map
	$(document).keydown(function(event) {
		if (event.keyCode == 38 && canMoveMap()) {
			self.moveUp.set(true)
		}

		if (event.keyCode == 39 && canMoveMap()) {
			self.moveRight.set(true)
		}

		if (event.keyCode == 40 && canMoveMap()) {
			self.moveDown.set(true)
		}

		if (event.keyCode == 37 && canMoveMap()) {
			self.moveLeft.set(true)
		}
	})

	$(document).keyup(function(event) {
		if (event.keyCode == 38) {
			self.moveUp.set(false)
		}

		if (event.keyCode == 39) {
			self.moveRight.set(false)
		}

		if (event.keyCode == 40) {
			self.moveDown.set(false)
		}

		if (event.keyCode == 37) {
			self.moveLeft.set(false)
		}
	})

	// arrow keys to scroll map
	self.autorun(function() {
		if (typeof(self.gridMoveTimer) != "undefined") {
			Meteor.clearInterval(self.gridMoveTimer)
		}

		if (self.moveUp.get() || self.moveRight.get() || self.moveDown.get() || self.moveLeft.get()) {
			self.gridMoveTimer = Meteor.setInterval(function() {
				Deps.nonreactive(function() {
					var hexes_pos = Session.get('hexes_pos')

					var x = hexes_pos.x
					var y = hexes_pos.y

					if (self.moveUp.get()) {
						y += s.hex_move_speed
					}

					if (self.moveRight.get()) {
						x -= s.hex_move_speed
					}

					if (self.moveDown.get()) {
						y -= s.hex_move_speed
					}

					if (self.moveLeft.get()) {
						x += s.hex_move_speed
					}

					dHexmap.moveHexesTo(x, y)
				})
			}, 33)
		}
	})
}


function canMoveMap() {
	if (Session.get('show_chatrooms_panel') || Session.get('showForumsPanel') || Session.get('show_market_panel') || Session.get('show_settings_panel')) {
		return false
	}

	if (Session.get('rp_template') == 'rp_hire_army' || Session.get('rp_template') == 'rp_move_unit' || Session.get('rp_template') == 'rp_split_armies') {
		return false
	}

	return true
}


Template.navigation_panel.destroyed = function() {
	$(document).unbind('keydown')
	$(document).unbind('keyup')
}


decrease_hex_scale = function() {
	var hex_scale = Session.get('hexScale');
	hex_scale -= 0.1
	if (hex_scale < s.hex_scale_min) {
		hex_scale = s.hex_scale_min
	}
	dHexmap.setHexScale(hex_scale)
}

increase_hex_scale = function() {
	var hex_scale = Session.get('hexScale');
	hex_scale += 0.1
	if (hex_scale > s.hex_scale_max) {
		hex_scale = s.hex_scale_max
	}
	dHexmap.setHexScale(hex_scale)
}
