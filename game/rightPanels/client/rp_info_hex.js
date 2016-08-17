Template.rp_info_hex.helpers({
	isPro: function() {
		let playerId = Session.get('playerId');
		if (playerId) {
			let player = Players.findOne(playerId, {fields: {pro:1}});
			if (player) {
				return player.pro;
			}
		}
	},

	typeName: function() {
		if (this.large) {
			return _.titleize('large '+this.type);
		} else {
			return _.titleize(this.type);
		}
	},

	isGrain: function() {
		return this.type == 'grain';
	},

	numResources: function() {
		let gameId = Session.get('gameId');
		if (this.large) {
			return round_number(_gs.villages(gameId, 'gained_at_hex') * _gs.villages(gameId, 'incomeInterval') * _s.villages.large_resource_multiplier);
		} else {
			return round_number(_gs.villages(gameId, 'gained_at_hex') * _gs.villages(gameId, 'incomeInterval'));
		}
	},

	interval: function() {
		return moment.duration(_s.init.resourceInterval).humanize()
	},

	worthOfHex: function() {
		return Template.instance().worthOfHex.get()
	}
})



Template.rp_info_hex.created = function() {
	var self = this;

	self.worthOfHex = new ReactiveVar(0);
	self.autorun(function() {
		let playerId = Session.get('playerId');
		let gameId = Session.get('gameId');
		if (playerId && gameId) {
			let player = Players.findOne(playerId, {fields: {pro:1}});
			if (player && player.pro) {
				var selected = Session.get('selected');
				if (selected && Number.isInteger(selected.x) && Number.isInteger(selected.y)) {
					Meteor.call('getResourcesGatheredAtHex', gameId, selected.x, selected.y, function(error, resources) {
						if (error) {
							console.error(error.reason);
							self.worthOfHex.set(0);
						} else {

							_s.market.types.forEach(function(type) {
				        resources[type] = resources[type];
				      });

							var gold = dMarket.resourcesToGold(gameId, resources);
							self.worthOfHex.set(gold);
						}
					});
				}
			}
		}
	});

	self.autorun(function() {
		var selected = Session.get('selected');
		let gameId = Session.get('gameId');
		if (gameId && selected && Number.isInteger(selected.x) && Number.isInteger(selected.y)) {
			Meteor.subscribe('gamePiecesAtHex', gameId, selected.x, selected.y);
		}
	});

	// If a hex is selected and there is a Castle or Village, select it instead.
	self.autorun(function() {
		var selected = Session.get('selected');
		if (selected && Number.isInteger(selected.x) && Number.isInteger(selected.y) && selected.type == 'hex') {
			var castle = Castles.findOne({x: selected.x, y: selected.y}, {fields:{_id:1}});
			var village = Villages.findOne({x: selected.x, y: selected.y}, {fields:{_id:1}});
			if (castle) {
				dInit.select('castle', this.x, this.y, castle._id);
			} else if (village) {
				dInit.select('village', this.x, this.y, village._id);
			}
		}
	});

	Session.set('mouse_mode', 'default')
	//Session.set('update_highlight', Random.fraction())
}
