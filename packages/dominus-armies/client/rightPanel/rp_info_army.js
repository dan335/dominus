Template.rp_info_army.helpers({
	isPro: function() {
		let playerId = Session.get('playerId');
		if (playerId) {
			let player = Players.findOne(playerId, {fields: {pro:1}});
			if (player) {
				return player.pro;
			}
		}
	},

	types: function() {
		return _s.armies.types;
	},

	numSoldierType: function() {
		var army = Template.parentData(1);
		if (army) {
			return army[this];
		}
	},

	unitRelationType: function() {
		if (Template.instance()) {
			var type = Template.instance().relationship.get()
			if (type && type != 'mine') {
				return dInit.getNiceRelationType(type)
			}
		}
	},

	offensePower: function() {
		if (Template.instance()) {
			var power = Template.instance().power.get()
			if (power) {
				return power.offense
			}
		}
	},

	defensePower: function() {
		if (Template.instance()) {
			var power = Template.instance().power.get()
			if (power) {
				return power.defense
			}
		}
	},

	infoLoaded: function() {
		return Session.get('rightPanelInfoLoaded')
	},

	battleInfoReady: function() {
		return Template.instance().battleInfoReady.get()
	},

	battle: function() {
		if (this) {
			return Battles2.findOne({x:this.x, y:this.y, isOver:false})
		}
	},

	has_enough_to_split: function() {
		if (this) {
			var self = this

			var count = 0
			_s.armies.types.forEach(function(type) {
				count += self[type]
			})

			return (count > 1)
		}
	},

	is_owner: function() {
		if (this && this.user_id == Meteor.userId()) {
			return true
		}
	},

	is_another_army_here: function() {
		if (this) {
			if (Armies.find({
				user_id: Meteor.userId(),
				x: this.x,
				y: this.y
			}).count() > 1) {
				return true
			}
		}
	},


	is_on_grain_hex: function() {
		var hex = Hexes.findOne({
			x:this.x,
			y:this.y
		}, {fields: {hasBuilding:1, type:1}})
		if (hex && hex.type == 'grain' && !hex.hasBuilding) {
			return true;
		}
	},

	is_on_village: function() {
		var player = Template.instance().playerData.get();
		if (player) {
			var village = Villages.findOne({x:this.x, y:this.y, playerId:player._id})
			if (village) {
				return true;
			}
		}
	},

	has_enough_grain: function() {
		var player = Template.instance().playerData.get()
		if (player && player.grain >= _s.villages.cost.level1.grain) {
			return true;
		}
	},

	has_enough_lumber: function() {
		var player = Template.instance().playerData.get()
		if (player && player.lumber >= _s.villages.cost.level1.lumber) {
			return true
		}
	},

	has_enough_ore: function() {
		var player = Template.instance().playerData.get()
		if (player && player.ore >= _s.villages.cost.level1.ore) {
			return true
		}
	},

	has_enough_wool: function() {
		var player = Template.instance().playerData.get()
		if (player && player.wool >= _s.villages.cost.level1.wool) {
			return true
		}
	},

	has_enough_clay: function() {
		var player = Template.instance().playerData.get()
		if (player && player.clay >= _s.villages.cost.level1.clay) {
			return true
		}
	},

	has_enough_glass: function() {
		var player = Template.instance().playerData.get()
		if (player && player.glass >= _s.villages.cost.level1.glass) {
			return true
		}
	},

	how_many_villages_can_i_build: function() {
		return _gs.villages(Session.get('gameId'), 'max_can_have') - Session.get('num_villages')
	},

	has_less_than_max_villages: function() {
		return (Session.get('num_villages') < _gs.villages(Session.get('gameId'), 'max_can_have'))
	},

	villageWorth: function() {
		return Template.instance().worthOfHex.get()
	},

	sVillages: function() {
		return _s.villages;
	},

	maxVillages: function() {
		return _gs.villages(Session.get('gameId'), 'max_can_have');
	}
})



Template.rp_info_army.events({
	'click #join_village_button': function(event, template) {
		var currentData = Template.currentData();
		if (currentData) {
			let buildingData = dArmies.methods.joinBuilding.call({armyId:currentData._id}, (error, buildingInfo) => {

				if (error) {
					console.error(error);
				} else {
					dInit.select(buildingInfo.buildingType, currentData.x, currentData.y, buildingInfo.buildingId);
				}
			});
		}
	},

	'click #disband_army_button': function() {
		Session.set('rp_template', 'rp_disbandArmy');
	},

	'click #move_army_button': function(event, template) {
		Session.set('rp_template', 'rp_moveArmy');
	},

	'click #return_to_castle_button': function(event, template) {
		var currentData = Template.currentData();
		if (currentData) {
			dArmies.methods.returnToCastle.call({armyId:this._id}, (error, buildingInfo) => {
				if (error) {
					console.error(error);
				} else {
					dInit.select(buildingInfo.buildingType, currentData.x, currentData.y, buildingInfo.buildingId);
				}
			});
		}
	},

	'click #combine_armies_button': function(event, template) {
		dArmies.methods.combineArmies.call({gameId:Session.get('gameId'), armyId:this._id});
	},

	'click #split_armies_button': function(event, template) {
		Session.set('rp_template', 'rp_split_armies')
	},

	'click #build_village_button': function(event, template) {
		var self = this;

		var alert = template.find('#build_village_error_alert')
		var button = template.find('#build_village_button')

		$(alert).hide()

		var button_html = $(button).html()
		$(button).attr('disabled', true)
		$(button).html('Please Wait')

		Meteor.apply('buildVillage', [Session.get('gameId'), self.x, self.y], {throwStubExceptions:true}, function(error, result) {
			if (error) {
				$(alert).show()
				$(alert).html(error.error)
				$(button).attr('disabled', false)
				$(button).html(button_html)
			} else {
				dInit.select('village', self.x, self.y, result);
			}
		})
	},
})



Template.rp_info_army.onCreated(function() {
	var self = this

	self.subs = new ReadyManager()

	// needed to check if can build a village
	self.autorun(function() {
		var data = Template.currentData();
		if (data) {
			Meteor.subscribe('gamePiecesAtHex', Session.get('gameId'), data.x, data.y);
		}
	})

	// worth of hex
	self.worthOfHex = new ReactiveVar(0);
	self.autorun(function() {
		let gameId = Session.get('gameId');
		let playerId = Session.get('playerId');
		let data = Template.currentData();
		if (playerId && gameId && data && Number.isInteger(data.x) && Number.isInteger(data.y)) {
			let player = Players.findOne(playerId, {fields: {pro:1}});
			if (player && player.pro) {
				Tracker.nonreactive(function() {
					Meteor.apply('getResourcesGatheredAtHex', [gameId, data.x, data.y], {}, function(error, resources) {
						if (error) {
							console.error(error.reason);
							self.worthOfHex.set(0);
						} else {

							_s.market.types.forEach(function(type) {
								resources[type] = resources[type];
							});

							var gold = dMarket.resourcesToGold(gameId, resources);
							self.worthOfHex.set(gold + _s.villages.gold_gained_at_village);
						}
					});
				})
			}
		}
	});

	// set army speed
	// check for selected type keeps it from erroring when selecting army then a hex
	self.speed = new ReactiveVar(0)
	self.autorun(function() {
		var selected = Session.get('selected');
		let gameId = Session.get('gameId');
		let data = Template.currentData();
		if (selected && data && selected.type == 'army') {
			self.speed.set(dArmies.speed(gameId, data));
		}
	})


	// used to tell if army can build village
	self.playerData = new ReactiveVar(null)
	this.autorun(function() {
		var userId = Meteor.userId();
		let army = Template.currentData();

		if (army && army.user_id == userId) {
			let fields = {};
			_s.market.types.forEach(function(type) {
				fields[type] = 1
			})

			let player = Players.findOne(army.playerId, {fields:fields});
			if (player) {
				self.playerData.set(player)
			}
		}
	});


	self.battleInfoReady = new ReactiveVar(false)
	self.autorun(function() {
		let data = Template.currentData();
		let gameId = Session.get('gameId');
		if (data) {
			var handle = Meteor.subscribe('battle_notifications_at_hex', gameId, data.x, data.y)
			self.battleInfoReady.set(handle.ready())
		}
	});


	// not needed?
	self.autorun(function() {
		if (Template.currentData()) {
			Session.set('mouse_mode', 'default');
			//Session.set('update_highlight', Random.fraction());	// needed?
		}
	});


	// offense and defense power
	self.power = new ReactiveVar(null);
	self.autorun(function() {
		let data = Template.currentData();
		if (data) {
			let basePower = dArmies.getUnitBasePower(Session.get('gameId'), data);
			self.power.set({
				offense: basePower.offense.total,
				defense: basePower.defense.total
			})
		}
	})



	self.relationship = new ReactiveVar(null)
	self.autorun(function() {
		let data = Template.currentData();
		if (data && data.playerId) {
			Tracker.nonreactive(function() {
				self.relationship.set(dInit.getRelationshipClient(data.playerId))
			})
		}
	})


	// add this player's units to minimap
	self.autorun(function() {
		let data = Template.currentData();
		if (data && data.playerId) {
			Meteor.subscribe('user_buildings_for_minimap', data.playerId)
		}
	})

});
