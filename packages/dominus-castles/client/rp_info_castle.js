Template.rp_info_castle.helpers({
	resourceTypes: function() {
		return _s.market.types_plus_gold;
	},

	incomeTypeGreaterThanZero: function() {
		let instance = Template.instance();
		if (instance && instance.playerData) {
			let player = instance.playerData.get();
			if (player && player.castleIncome && player.vassalIncome) {
				if (player.castleIncome[this] || player.vassalIncome[this]) {
					return true;
				}
			}
		}
	},

	castleIncomeType: function() {
		let instance = Template.instance();
		if (instance && instance.playerData) {
			let player = instance.playerData.get();
			if (player && player.castleIncome) {
				return player.castleIncome[this];
			}
		}
	},

	vassalIncomeType: function() {
		let instance = Template.instance();
		if (instance && instance.playerData) {
			let player = instance.playerData.get();
			if (player && player.vassalIncome) {
				return player.vassalIncome[this];
			}
		}
	},

	isPro: function() {
		let player = Players.findOne({gameId:Session.get('gameId'), userId:Meteor.userId()});
		if (player && player.pro) {
			return true;
		}
	},

	hasSoldierType: function() {
		var village = Template.parentData(1);
		if (village) {
			return village[this] > 0;
		}
	},

	numSoldierType: function() {
		var village = Template.parentData(1);
		if (village) {
			return village[this];
		}
	},

	unitRelationType: function() {
		let instance = Template.instance();
		if (instance && instance.relationship) {
			var type = instance.relationship.get();
			if (type && type != 'mine') {
				return dInit.getNiceRelationType(type);
			}
		}
	},

	defensePower: function() {
		let instance = Template.instance();
		if (instance && instance.power) {
			var power = instance.power.get();
			if (power) {
				return power.defense;
			}
		}
	},

	castleInfoLoaded: function() {
		return Session.get('rightPanelInfoLoaded');
	},

	battle: function() {
		if (this) {
			return Battles2.findOne({x:this.x, y:this.y, isOver:false});
		}
	},

	image_radio_is_checked: function() {
		if (Template.parentData(1).image == this.toString()) {
			return 'checked';
		}
	},

	more_than_one_owned_image: function() {
		let userId = Meteor.userId();
		let options = {fields:{purchases:1}};
		let user = Meteor.users.findOne(userId, options);
		if (user && user.purchases && user.purchases.castles) {
			return user.purchases.castles.length > 1;
		}
	},

	owned_images: function() {
		let userId = Meteor.userId();
		let options = {fields:{purchases:1}};
		let user = Meteor.users.findOne(userId, options);
		if (user && user.purchases && user.purchases.castles) {
			return user.purchases.castles;
		}
	},

	image_name: function(id) {
		return _s.store.castles[id].name;
	},

	is_owner: function() {
		let instance = Template.instance();
		let data = Template.currentData();
		if (instance && instance.playerData && data) {
			let playerData = instance.playerData.get();
			if (playerData) {
				if (data.playerId == playerData._id) {
					return true;
				}
			}
		}
		return false;
	},

	no_soldiers: function() {
		if (this) {
			var self = this;
			var count = 0;

			_s.armies.types.forEach(function(type) {
				count += self[type];
			});

			return count === 0;
		}
	},

	is_vassal: function() {
		let instance = Template.instance();
		if (instance.playerData) {
		// if (instance.playerData && Template.currentData()) { why currentData?
			var type = instance.relationship.get();
			return type == 'vassal' || type == 'direct_vassal';
		}
	},

	player: function() {
		let data = Template.currentData();
		if (data) {
			return RightPanelPlayers.findOne(data.playerId);
		}
	},

	daysSincePlayerActive: function() {
		var days = Template.instance().daysSincePlayerActive.get();
		if (days === null) {
			return null;
		}

		if (days === 0) {
			return 'today';
		} else if (days === 1) {
			return 'yesterday';
		} else {
			return days+' days ago';
		}
	},

	nextIncomeUpdate: function() {
		Session.get('refresh_time_field_every_sec');
		let instance = Template.instance();
		if (instance && instance.playerData) {
			let lastUpdate = instance.playerData.get().lastIncomeUpdate;
			if (lastUpdate) {
				let interval = _gs.villages(Session.get('gameId'), 'incomeInterval');
				return moment(new Date(lastUpdate)).add(interval, 'ms').toDate() - moment().toDate();
			}
		}
	}
});



Template.rp_info_castle.events({
	'click #createArmycastleButton': function(event, template) {
		event.preventDefault();
		Session.set('rp_template', 'rp_createArmy');
	},

	'click #hire_army_from_castle_button': function(event, template) {
		event.preventDefault();
		Session.set('rp_template', 'rp_hire_army');

	},

	'click #send_gold_button': function(event, template) {
		event.preventDefault();
		Session.set('rp_template', 'rp_send_gold');
	},

	'change .image_radios': function(event, template) {
		var castle_id = UI._templateInstance().data._id;
		Meteor.call('set_unit_image', castle_id, 'castles', this.toString(), Session.get('playerId'));
	},

	'click #createChatButton': function(event, template) {
		event.preventDefault();
		Meteor.call('startChatroomWith', Session.get('gameId'), template.data.username);
	},

	'click #reportPlayerButton': function(event, template) {
		event.preventDefault();
		Session.set('rp_template', 'rp_reportPlayer');
	},
});


Template.rp_info_castle.created = function() {
	var self = this;
	self.subs = new ReadyManager();

	Session.set('mouse_mode', 'default');
	//Session.set('update_highlight', Random.fraction());

	self.autorun(function() {
		let data = Template.currentData();
		let gameId = Session.get('gameId');
		if (data) {
			self.subs.subscriptions([{
				groupName: 'gamePiecesAtHex',
				subscriptions: [ Meteor.subscribe('gamePiecesAtHex', gameId, data.x, data.y).ready() ]
			}, {
				groupName: 'RightPanelPlayer',
				subscriptions: [ Meteor.subscribe('rightPanelPlayers', data.playerId).ready() ]
			}, {
				groupName: 'battleInfo',
				subscriptions: [ Meteor.subscribe('battle_notifications_at_hex', gameId, data.x, data.y).ready() ]
			}, {
				groupName: 'forMinimap',
				subscriptions: [ Meteor.subscribe('user_buildings_for_minimap', data.playerId).ready() ]
			}]);

			Meteor.subscribe('rightPanelTree', data.playerId);
		}
	});


	self.playerData = new ReactiveVar(null);
	this.autorun(function() {
		let find = {gameId:Session.get('gameId'), userId:Meteor.userId()};
		let options = {fields: {vassalIncome:1, castleIncome:1, lastIncomeUpdate:1, vassals: 1, allies_below: 1, lord: 1}};
		var player = Players.findOne(find, options);
		if (player) {
			self.playerData.set(player);
		}
	});


	self.power = new ReactiveVar(null);
	self.autorun(function() {
		let data = Template.currentData();
		let gameId = Session.get('gameId');
		if (data && gameId) {
			Tracker.nonreactive(function() {
				var basePower = dArmies.getUnitBasePower(gameId, data);
				var locationMultiplier = dHexmap.getUnitLocationBonusMultiplier(data, 'castle');

				var power = {
					offense: basePower.offense.total * locationMultiplier,
					defense: basePower.defense.total * locationMultiplier
				};

				self.power.set(power);
			});
		}
	});


	self.relationship = new ReactiveVar(null);
	self.autorun(function() {
		let data = Template.currentData();
		if (data && data.playerId) {
			Tracker.nonreactive(function() {
				self.relationship.set(dInit.getRelationshipClient(data.playerId));
			});
		}
	});


	self.daysSincePlayerActive = new ReactiveVar(null);
	self.autorun(function() {
		let p = Players.findOne({userId:Meteor.userId()}, {fields: {pro:1}});
		if (p && p.pro) {
			let data = Template.currentData();
			if (data && data.user_id) {
				Meteor.call('daysSincePlayerActive', data.user_id, function(error, result) {
					self.daysSincePlayerActive.set(result);
				});
			}
		}
	});
};
