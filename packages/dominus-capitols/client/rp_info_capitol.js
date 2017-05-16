Template.rp_info_capital.helpers({
  capitalInfoLoaded: function() {
		return Session.get('rightPanelInfoLoaded');
	},

  is_owner: function() {
    let playerId = Session.get('playerId');
    if (playerId) {
      return this.playerId === Session.get('playerId');
    } else {
      return false;
    }
	},

  sMarket: function() {
    return sMarket;
  },

  income: function() {
    var capital = Template.parentData(1);
    var type = Template.currentData();
    if (capital && capital.income) {
      return capital.income[type];
    }
  },

  player: function() {
    var capital = Template.currentData();
    if (capital) {
      return RightPanelPlayers.findOne({_id:capital.playerId});
    }
  },

  _s: function() {
    return _s;
  },

  worth: function() {
    var capital = Template.currentData();
    if (capital && capital.income && capital.income.worth) {
      return capital.income.worth
    }
  },

  sIncome: function() {
    return _gs.capitals(Session.get('gameId'), 'income');
  },

  villagePercentageIncome: function() {
    return _gs.capitals(Session.get('gameId'), 'villagePercentageIncome');
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

  defensePower: function() {
		let instance = Template.instance();
		if (instance && instance.power) {
			var power = instance.power.get();
			if (power) {
				return power.defense;
			}
		}
	},

  nextIncomeUpdate: function() {
		Session.get('refresh_time_field_every_sec');
		let interval = _gs.capitals(Session.get('gameId'), 'incomeInterval');
		let capital = Template.currentData();
		if (capital && capital.lastIncomeUpdate) {
			return moment(new Date(capital.lastIncomeUpdate)).add(interval, 'ms').toDate() - moment().toDate();
		}
	}
});


Template.rp_info_capital.onCreated(function() {
  var self = this;

  this.autorun(function() {
    var data = Template.currentData();
    if (data && data.playerId) {
      Meteor.subscribe('rightPanelPlayers', data.playerId);
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
})
