Template.rp_info_village.helpers({
	// for progress bar
	villageUpgradeProgress: function() {
		if (this) {
			Session.get('refresh_time_field')
			let timeToBuild = _gs.villages(Session.get('gameId'), 'cost.level'+(this.level+1)+'.timeToBuild');
			//var timeToBuild = _s.villages.cost['level'+(this.level+1)].timeToBuild
			var startedAt = moment(new Date(this.constructionStarted))
			var diff = moment().diff(startedAt)
			var percentage = diff / timeToBuild
			return percentage * 100
		}
	},

	resourcesTypePerInterval: function() {
		var village = Template.parentData(1)
		if (village) {
			return round_number(village.income[this]);
		}
	},

	incomeTypeGreaterThanZero: function() {
		var village = Template.parentData(1)
		if (village) {
			if (village.income[this] > 0) {
				return true
			}
		}
	},

	canUpgrade: function() {
		if (this) {
			if (this.level < _s.villages.maxLevel) {
				if (!this.under_construction) {
					return true
				}
			}
		}
	},

	levelPlusOne: function() {
		if (this) {
			return this.level+1
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

	timeTilFinishedBuilding: function() {
		if (this) {
			Session.get('refresh_time_field')
			let timeToBuild = _gs.villages(Session.get('gameId'), 'cost.level'+(this.level+1)+'.timeToBuild');
			//var timeToBuild = _s.villages.cost['level'+(this.level+1)].timeToBuild
			var finishAt = moment(new Date(this.constructionStarted)).add(timeToBuild, 'ms')
			if (moment().isAfter(finishAt)) {
				return 'soon'
			} else {
				return finishAt.fromNow()
			}
		}
	},

	battleInfoLoaded: function() {
		return Template.instance().battleInfoLoaded.get()
	},

	battle: function() {
		if (this) {
			return Battles2.findOne({x:this.x, y:this.y, isOver:false})
		}
	},

	is_owner: function() {
		if (this) {
			return this.user_id == Meteor.userId()
		}
	},

	hasSoldierType: function() {
		var village = Template.parentData(1)
		if (village) {
			return village[this] > 0
		}
	},

	numSoldierType: function() {
		var village = Template.parentData(1)
		if (village) {
			return village[this]
		}
	},

	no_soldiers: function() {
		if (this) {
			var self = this
			var count = 0
			_.each(_s.armies.types, function(type) {
				count += self[type]
			})
			return (count == 0)
		}
	},

	interval: function() {
		return moment.duration(_s.init.resourceInterval).humanize()
	},

	incomeInGold: function() {
		let gameId = Session.get('gameId');
		if (this && gameId) {
			let income = this.income;
			if (income) {
				let gold = _s.villages.gold_gained_at_village;
				gold += dMarket.resourcesToGold(gameId, income);
				return gold;
			}
		}
	},

	nextIncomeUpdate: function() {
		Session.get('refresh_time_field_every_sec');
		let interval = _gs.villages(Session.get('gameId'), 'incomeInterval');
		let village = Template.currentData();
		if (village && village.lastIncomeUpdate) {
			return moment(new Date(village.lastIncomeUpdate)).add(interval, 'ms').toDate() - moment().toDate();
		}
	}

})



Template.rp_info_village.events({
	'click #upgradeVillageButton': function(event, template) {
		event.preventDefault();
		Session.set('rp_template', 'rp_village_upgrade')
	},

	'click #send_army_from_village_button': function(event, template) {
		event.preventDefault();
		Session.set('rp_template', 'rp_createArmy')
	},

	'click #destroy_village_button': function(event, template) {
		event.preventDefault();
		Session.set('rp_template', 'rp_destroy_village_confirm')
	},

	'click #hireArmyButton': function(event, template) {
		event.preventDefault();
		Session.set('rp_template', 'rp_hire_army')
	},

	'click #createChatButton': function(event, template) {
		event.preventDefault();
		Meteor.call('startChatroomWith', Session.get('gameId'), template.data.username)
	}
})



Template.rp_info_village.created = function() {
	var self = this
	self.subs = new ReadyManager()

	self.autorun(function() {
		let gameId = Session.get('gameId');
		let data = Template.currentData();
		if (data && gameId) {
			Meteor.subscribe('gamePiecesAtHex', gameId, data.x, data.y)
			Meteor.subscribe('armiesAtHex', gameId, data.x, data.y);
		}
	})

	Session.set('mouse_mode', 'default')
	//Session.set('update_highlight', Random.fraction())

	self.battleInfoLoaded = new ReactiveVar(false)
	this.autorun(function() {
		let data = Template.currentData();
		let gameId = Session.get('gameId');
		if (data && gameId) {
			var battleInfoHandle = Meteor.subscribe('battle_notifications_at_hex', gameId, data.x, data.y)
			self.battleInfoLoaded.set(battleInfoHandle.ready())
		}
	})


	self.power = new ReactiveVar(null)
	self.autorun(function() {
		let gameId = Session.get('gameId');
		let data = Template.currentData();
		if (data && gameId) {
			var selected = Session.get('selected');

			Tracker.nonreactive(function() {
				if (selected && selected.type) {
					var basePower = dArmies.getUnitBasePower(gameId, data)
					var locationMultiplier = dHexmap.getUnitLocationBonusMultiplier(data, selected.type);

					var power = {
						offense: basePower.offense.total * locationMultiplier,
						defense: basePower.defense.total * locationMultiplier
					}

					self.power.set(power)
				}
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
			Meteor.subscribe('user_buildings_for_minimap', data.playerId);
		}
	})
}
