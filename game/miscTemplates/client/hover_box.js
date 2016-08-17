Template.hover_box.helpers({
	draw: function() {
		return (Session.get('hover_on_object') || Session.get('hover_on_hover_box'));
	},

	left: function() {
		var x = Session.get('hover_box_data').x
		var y = Session.get('hover_box_data').y

		check(x, validNumber)
		check(y, validNumber)

		var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish)

		var offset = 0

		if (Session.get('hover_box_data').type == 'army') {
			offset = -10

		} else if (Session.get('hover_box_data').type == 'castle') {
			offset = -40

		} else if (Session.get('hover_box_data').type == 'village') {
			offset = -40
		}

		// this is outside of #hexes so it needs to be scaled
		var x = grid.x * Session.get('hexScale')

		return Session.get('hexes_pos').x + x + offset
	},

	top: function() {
		var x = Session.get('hover_box_data').x
		var y = Session.get('hover_box_data').y

		check(x, validNumber)
		check(y, validNumber)

		var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish)

		var offset = 0

		if (Session.get('hover_box_data').type == 'army') {
			offset = 35

		} else if (Session.get('hover_box_data').type == 'castle') {
			offset = -50

		} else if (Session.get('hover_box_data').type == 'village') {
			offset = -50
		}

		// this is outside of #hexes so it needs to be scaled
		var y = grid.y * Session.get('hexScale')

		return Session.get('hexes_pos').y + y + offset
	},

	objects: function() {
		var fields = {
			username:1,
			user_id:1,
			name:1,
			playerId:1
		}

		_s.armies.types.forEach(function(type) {
			fields[type] = 1
		})

		if (Session.get('hover_box_data').type == 'army') {
			var res = Armies.find({x: Session.get('hover_box_data').x, y: Session.get('hover_box_data').y}, {fields: fields})

		} else if (Session.get('hover_box_data').type == 'castle') {
			var res = Castles.find({x: Session.get('hover_box_data').x, y: Session.get('hover_box_data').y}, {fields: fields})

		}  else if (Session.get('hover_box_data').type == 'village') {
			var res = Villages.find({x: Session.get('hover_box_data').x, y: Session.get('hover_box_data').y}, {fields: fields})
		}


		// units, username and type
		res = res.map(function(object) {
			var units = ''

			_s.armies.types.forEach(function(type) {
				if (object[type] && object[type] > 0) {
					units += _.capitalize(type)+': '+round_number(object[type])+' &nbsp;'
				}
			})

			object.units = units

			object.type = Session.get('hover_box_data').type

			return object
		})



		// flag type
		var player = Players.findOne(Session.get('playerId'), {fields: {lord:1, allies_above:1, allies_below:1, team:1, king:1, vassals:1}})
		if (player) {
			res = res.map(function(object) {
				if (object.playerId == player._id) {
					object.flag_type = 'mine'
					object.flag_name = 'Mine'
				} else if (_.indexOf(player.team, object.playerId) != -1) {

					if (_.indexOf(player.allies_above, object.playerId) != -1) {

						var oPlayer = Players.findOne(object.playerId, {fields: {is_dominus:1}})

						if (oPlayer && oPlayer.is_dominus) {
							object.flag_type = 'dominus'
							object.flag_name = 'Dominus'
						} else if (object.playerId == player.king) {
							object.flag_type = 'king'
							object.flag_name = 'King'
						} else if (object.playerId == player.lord) {
							object.flag_type = 'lord'
							object.flag_name = 'Lord'
						} else {
							object.flag_type = 'above'
							object.flag_name = 'Upper Lord'
						}

					} else if (_.indexOf(player.allies_below, object.playerId) != -1) {

						if (_.indexOf(player.vassals, object.playerId) != -1) {
							object.flag_type = 'vassal'
							object.flag_name = 'Vassal'
						} else {
							object.flag_type = 'below'
							object.flag_name = 'Lower Vassal'
						}

					} else {
						object.flag_type = 'team'
						object.flag_name = 'Enemy Ally'
					}

				} else {
					object.flag_type = 'foe'
					object.flag_name = 'Enemy'
				}

				return object

			})
		}

		return res
	}
})



Template.hover_box.events({
	'mouseenter #hover_box': function(event, template) {
		Meteor.clearTimeout(Session.get('hover_on_object_timer'))
		Session.set('hover_on_hover_box', true)
		Session.set('hover_on_object', false)
	},

	'mouseleave #hover_box': function(event, template) {
		Meteor.clearTimeout(Session.get('hover_on_object_timer'))
		Session.set('hover_on_hover_box', false)
	},

	'click .hover_box_object_link': function(event, template) {
		event.preventDefault();
		var data = Session.get('hover_box_data')
		var id = event.currentTarget.getAttribute('data-id');
		dInit.select(data.type, data.x, data.y, id);
		Session.set('hover_on_hover_box', false)
	}
})


// flag box
Session.setDefault('hover_box_data', null)
Session.setDefault('hover_on_object', false)
Session.setDefault('hover_on_hover_box', false)
Session.setDefault('draw_hover_box', false)
Session.setDefault('hover_on_object_timer', null)
