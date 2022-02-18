Meteor.methods({
  buildVillage: function(gameId, x, y) {
    check(gameId, String);
    check(x, Match.Integer);
    check(y, Match.Integer);
    //this.unblock();
    var self = this;

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

		var player = Players.findOne({userId:self.userId, gameId:gameId}, {fields: fields});
    if (!player) {
      throw new Meteor.Error('No player found.');
    }

		// make sure user doesn't have max villages already
		if (Villages.find({playerId:player._id}).count() >= _gs.villages(gameId, 'max_can_have')) {
			throw new Meteor.Error('Already have max villages.');
		}

		// make sure user has an army here
		if (!Armies.find({playerId:player._id, x:x, y:y}).count()) {
			throw new Meteor.Error('No army on hex.');
		}

		var hasEnoughRes = true;

    _s.market.types.forEach(function(type) {
			if (player[type] < _s.villages.cost.level1[type]) {
				hasEnoughRes = false;
			}
		});
    if (!hasEnoughRes) {
      throw new Meteor.Error('Not enough resources.')
    }

    if (!this.isSimulation) {
      var hex = Hexes.findOne({gameId:gameId, x:x, y:y}, {fields: {_id:1, type:1, hasBuilding:1}});
      if (!hex) {
        throw new Meteor.Error('No hex found in db for '+x+','+y+'.');
      }

      if (hex.type != 'grain') {
  			throw new Meteor.Error('Must be a grain hex.');
  		}

      if (hex.hasBuilding) {
        throw new Meteor.Error('Already a building on hex.');
      }
    }

    var allies = _.union(player.allies_above, player.allies_below, player._id);
    if (Armies.find({gameId:gameId, x:x, y:y, playerId:{$nin:allies}}).count()) {
      throw new Meteor.Error('Cannot build a village on an enemy occupied hex.');
    }

    var name = _s.villages.names.part1[_.random(_s.villages.names.part1.length-1)] + _s.villages.names.part2[_.random(_s.villages.names.part2.length-1)];

		// find how much the village makes
		var income = {};

    _s.market.types_plus_gold.forEach(function(type) {
			income[type] = 0;
		});

		income.gold = _s.villages.gold_gained_at_village;

		var hexes = Hx.getSurroundingHexes(x, y, _s.villages.num_rings_village);
    hexes.forEach(function(hx) {
			var h = Hexes.findOne({gameId:gameId, x:hx.x, y:hx.y}, {fields:{type:1, large:1}})
			if (h) {
				if (h.large) {
					income[h.type] += _gs.villages(gameId, 'gained_at_hex') * _gs.villages(gameId, 'incomeInterval') * _s.villages.large_resource_multiplier;
				} else {
					income[h.type] += _gs.villages(gameId, 'gained_at_hex') * _gs.villages(gameId, 'incomeInterval');
				}
			}
		})

    var countryId = null;
    if (!self.isSimulation) {
      countryId = Mapmaker.coordsToCountryId(gameId, x, y);
    }

		var fields = {
      gameId:gameId,
      playerId:player._id,
			x: x,
			y: y,
			user_id: self.userId,
			created_at: new Date(),
			name: name,
			username: player.username,
			castle_x: player.x,
			castle_y: player.y,
			castle_id: player.castle_id,
      countryId: countryId,
			income: income,
			under_construction:true,
			constructionStarted: new Date(),
			level: 0,	// villages are level 0 until finished building
      male: player.male,
      lastIncomeUpdate: new Date()
		};

    _s.armies.types.forEach(function(type) {
			fields[type] = 0;
		});

		var villageId = Villages.insert(fields);

		// take away resources for buying
		var inc = {};

    _s.market.types.forEach(function(type) {
			inc[type] = -1 * _s.villages.cost.level1[type];
		});

		Players.update({_id: player._id}, {$inc: inc});

    if (!self.isSimulation) {
      // if army is there merge them
  		Armies.find({x:x, y:y, playerId:player._id}).forEach(function(army) {
  			if (dArmies.isStopped(army._id)) {
  				var fields = {}

          _s.armies.types.forEach(function(type) {
  					fields[type] = army[type];
  				});

  				Villages.update(villageId, {$inc: fields});
          dArmies.destroyArmy(army._id);
  			}
  		})

      Mapmaker.buildingAdded(gameId, x, y);
    }

		return villageId;
	},



  upgradeVillage: function(gameId, villageId) {
    check(villageId, String);
    check(gameId, String);

    // get village
    var village = Villages.findOne({_id:villageId, user_id:this.userId})

    if (!village) {
        throw new Meteor.Error('No village found.')
    }

    // get user
    var userFields = {}
    _s.market.types.forEach(function(type) {
        userFields[type] = 1
    })
    let player = Players.findOne(village.playerId, {fields:userFields});
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

    // passed tests, set under construction flag to true
    Villages.update(villageId, {$set:{under_construction:true, constructionStarted:new Date()}})

    // subtract cost from user
    var inc = {}
    _s.market.types.forEach(function(type) {
      let path = 'cost.level'+(village.level+1)+'.'+type;
      let cost = _gs.villages(gameId, path);
      inc[type] = -1 * cost;
    })
    Players.update(player._id, {$inc:inc});

    if (!this.isSimulation) {
    }

    return true;
  },




	destroyVillage: function(villageId) {
		//this.unblock();
		check(villageId, String);

    let find = {_id:villageId, user_id:this.userId};
    let village = Villages.findOne(find, {fields: {_id:1}});

    if (!village) {
      throw new Meteor.Error('villageNotFound', 'Village not found.');
    }

    if (!this.isSimulation) {
      Queues.add('destroyVillage', {villageId:villageId}, {attempts:10, backoff:{type:'fixed', delay:5000}, delay:0, timeout:1000*60*5}, villageId);
    }
	}
})
