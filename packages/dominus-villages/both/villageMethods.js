// buildVillage and upgradeVillage run on the client too, so the village and
// the cost show at once. Each stays a plain function: the simulation is sync
// and the server's part is async (see "Async conversion" in CLAUDE.md).
// destroyVillage only queues a job, so it is server-only.

var buildVillagePlayerFields = function() {
	var fields = {
		x:1,
		y:1,
		username:1,
		castle_id:1,
		allies_above:1,
		allies_below:1,
		male:1,
	};

	_s.market.types.forEach(function(type) {
		fields[type] = 1
	})

	return fields;
};

var checkCanAffordVillage = function(player) {
	var hasEnoughRes = true;

	_s.market.types.forEach(function(type) {
		if (player[type] < _s.villages.cost.level1[type]) {
			hasEnoughRes = false;
		}
	});
	if (!hasEnoughRes) {
		throw new Meteor.Error('Not enough resources.')
	}
};

var checkVillageHex = function(hex, x, y) {
	if (!hex) {
		throw new Meteor.Error('No hex found in db for '+x+','+y+'.');
	}

	if (hex.type != 'grain') {
		throw new Meteor.Error('Must be a grain hex.');
	}

	if (hex.hasBuilding) {
		throw new Meteor.Error('Already a building on hex.');
	}
};

var newVillageName = function() {
	return _s.villages.names.part1[dRandom.random(_s.villages.names.part1.length-1)] + _s.villages.names.part2[dRandom.random(_s.villages.names.part2.length-1)];
};

// what a village gathers, from the hexes (or undefined) around it
var villageIncome = function(gameId, hexes) {
	var income = {};

	_s.market.types_plus_gold.forEach(function(type) {
		income[type] = 0;
	});

	income.gold = _s.villages.gold_gained_at_village;

	hexes.forEach(function(h) {
		if (h) {
			if (h.large) {
				income[h.type] += _gs.villages(gameId, 'gained_at_hex') * _gs.villages(gameId, 'incomeInterval') * _s.villages.large_resource_multiplier;
			} else {
				income[h.type] += _gs.villages(gameId, 'gained_at_hex') * _gs.villages(gameId, 'incomeInterval');
			}
		}
	})

	return income;
};

var newVillage = function(gameId, userId, player, x, y, name, income, countryId) {
	var fields = {
		gameId:gameId,
		playerId:player._id,
		x: x,
		y: y,
		user_id: userId,
		created_at: dClock.now(),
		name: name,
		username: player.username,
		castle_x: player.x,
		castle_y: player.y,
		castle_id: player.castle_id,
		countryId: countryId,
		income: income,
		under_construction:true,
		constructionStarted: dClock.now(),
		level: 0,	// villages are level 0 until finished building
		male: player.male,
		lastIncomeUpdate: dClock.now()
	};

	_s.armies.types.forEach(function(type) {
		fields[type] = 0;
	});

	return fields;
};

// take away resources for buying
var buildVillageCost = function() {
	var inc = {};

	_s.market.types.forEach(function(type) {
		inc[type] = -1 * _s.villages.cost.level1[type];
	});

	return inc;
};

var checkCanUpgradeVillage = function(gameId, village, player) {
	if (!player) {
		throw new Meteor.Error('No player found.')
	}

	// village not already at max level
	if (village.level >= _s.villages.maxLevel) {
		throw new Meteor.Error('Village at max level.')
	}

	// village not under construction
	if (village.under_construction) {
		throw new Meteor.Error('Cannot upgrade village while under construction.')
	}

	// does user have enough
	var hasEnough = true
	_s.market.types.forEach(function(type) {
		let path = 'cost.level'+(village.level+1)+'.'+type;
		let cost = _gs.villages(gameId, path);
		if (player[type] < cost) {
			hasEnough = false;
		}
	})

	if (!hasEnough) {
		throw new Meteor.Error('Not enough resources.')
	}
};

// subtract cost from user
var upgradeVillageCost = function(gameId, village) {
	var inc = {}
	_s.market.types.forEach(function(type) {
		let path = 'cost.level'+(village.level+1)+'.'+type;
		let cost = _gs.villages(gameId, path);
		inc[type] = -1 * cost;
	})
	return inc;
};

var marketTypeFields = function() {
	var userFields = {}
	_s.market.types.forEach(function(type) {
		userFields[type] = 1
	})
	return userFields;
};

Meteor.methods({
  buildVillage: function(gameId, x, y) {
    check(gameId, String);
    check(x, Match.Integer);
    check(y, Match.Integer);
    //this.unblock();
    var self = this;

		var fields = buildVillagePlayerFields();
		var surrounding = Hx.getSurroundingHexes(x, y, _s.villages.num_rings_village);

		if (this.isSimulation) {
			var player = Players.findOne({userId:self.userId, gameId:gameId}, {fields: fields});
			if (!player) {
				throw new Meteor.Error('No player found.');
			}

			if (Villages.find({playerId:player._id}).count() >= _gs.villages(gameId, 'max_can_have')) {
				throw new Meteor.Error('Already have max villages.');
			}

			if (!Armies.find({playerId:player._id, x:x, y:y}).count()) {
				throw new Meteor.Error('No army on hex.');
			}

			checkCanAffordVillage(player);

			var allies = _.union(player.allies_above, player.allies_below, player._id);
			if (Armies.find({gameId:gameId, x:x, y:y, playerId:{$nin:allies}}).count()) {
				throw new Meteor.Error('Cannot build a village on an enemy occupied hex.');
			}

			var name = newVillageName();
			var income = villageIncome(gameId, surrounding.map(function(hx) {
				return Hexes.findOne({gameId:gameId, x:hx.x, y:hx.y}, {fields:{type:1, large:1}});
			}));

			var villageId = Villages.insert(newVillage(gameId, self.userId, player, x, y, name, income, null));
			Players.update({_id: player._id}, {$inc: buildVillageCost()});
			return villageId;
		}

		return (async () => {
			var player = await Players.findOneAsync({userId:self.userId, gameId:gameId}, {fields: fields});
			if (!player) {
				throw new Meteor.Error('No player found.');
			}

			// make sure user doesn't have max villages already
			if (await Villages.find({playerId:player._id}).countAsync() >= _gs.villages(gameId, 'max_can_have')) {
				throw new Meteor.Error('Already have max villages.');
			}

			// make sure user has an army here
			if (!await Armies.find({playerId:player._id, x:x, y:y}).countAsync()) {
				throw new Meteor.Error('No army on hex.');
			}

			checkCanAffordVillage(player);

			checkVillageHex(await Hexes.findOneAsync({gameId:gameId, x:x, y:y}, {fields: {_id:1, type:1, hasBuilding:1}}), x, y);

			var allies = _.union(player.allies_above, player.allies_below, player._id);
			if (await Armies.find({gameId:gameId, x:x, y:y, playerId:{$nin:allies}}).countAsync()) {
				throw new Meteor.Error('Cannot build a village on an enemy occupied hex.');
			}

			var name = newVillageName();

			// find how much the village makes
			var hexes = [];
			for (const hx of surrounding) {
				hexes.push(await Hexes.findOneAsync({gameId:gameId, x:hx.x, y:hx.y}, {fields:{type:1, large:1}}));
			}
			var income = villageIncome(gameId, hexes);

			var countryId = Mapmaker.coordsToCountryId(gameId, x, y);

			var villageId = await Villages.insertAsync(newVillage(gameId, self.userId, player, x, y, name, income, countryId));

			await Players.updateAsync({_id: player._id}, {$inc: buildVillageCost()});

			// if army is there merge them
			for (const army of await Armies.find({x:x, y:y, playerId:player._id}).fetchAsync()) {
				if (dArmies.isStopped(army._id)) {
					var soldiers = {}

					_s.armies.types.forEach(function(type) {
						soldiers[type] = army[type];
					});

					await Villages.updateAsync(villageId, {$inc: soldiers});
					dArmies.destroyArmy(army._id);
				}
			}

			Mapmaker.buildingAdded(gameId, x, y);

			return villageId;
		})();
	},



  upgradeVillage: function(gameId, villageId) {
    check(villageId, String);
    check(gameId, String);

    // get village
    // client copies of villages don't have gameId
    var villageFind = {_id:villageId, user_id:this.userId};

    if (this.isSimulation) {
      var village = Villages.findOne(villageFind)
      if (!village) {
        throw new Meteor.Error('No village found.')
      }

      checkCanUpgradeVillage(gameId, village, Players.findOne(village.playerId, {fields:marketTypeFields()}));
      Villages.update(villageId, {$set:{under_construction:true, constructionStarted:dClock.now()}})
      Players.update(village.playerId, {$inc:upgradeVillageCost(gameId, village)});
      return true;
    }

    villageFind.gameId = gameId;

    return (async () => {
      var village = await Villages.findOneAsync(villageFind)

      if (!village) {
          throw new Meteor.Error('No village found.')
      }

      // get user
      let player = await Players.findOneAsync(village.playerId, {fields:marketTypeFields()});
      checkCanUpgradeVillage(gameId, village, player);

      // passed tests, set under construction flag to true
      await Villages.updateAsync(villageId, {$set:{under_construction:true, constructionStarted:dClock.now()}})

      await Players.updateAsync(player._id, {$inc:upgradeVillageCost(gameId, village)});

      return true;
    })();
  },
})


if (Meteor.isServer) {
  Meteor.methods({
    destroyVillage: async function(villageId) {
      //this.unblock();
      check(villageId, String);

      let find = {_id:villageId, user_id:this.userId};
      let village = await Villages.findOneAsync(find, {fields: {_id:1}});

      if (!village) {
        throw new Meteor.Error('villageNotFound', 'Village not found.');
      }

      await Queues.addAsyncOrLog('destroyVillage', {villageId:villageId}, {attempts:10, backoff:{type:'fixed', delay:5000}, delay:0, timeout:1000*60*5}, villageId);
    }
  })
}
