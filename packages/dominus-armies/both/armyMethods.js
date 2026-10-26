// the fields hireArmy reads
var hirePlayerFields = function() {
  var userFields = {username:1, x:1, y:1, allies_below:1, castle_id:1}
  _s.market.types_plus_gold.forEach(function(type) {
    userFields[type] = 1
  })
  return userFields;
};

var hireBuildingFields = function() {
  var fields = {playerId:1}
  _s.armies.types.forEach(function(type) {
    fields[type] = 1
  })
  return fields;
};

// Checks a hire and works out what it costs, for the simulation and the
// server alike. market is each resource's price. Returns null when the
// building is neither yours nor an ally below's, and otherwise what to buy on
// the market first (needed), and the $inc for the player and the building.
var planHire = function(gameId, army, player, building, building_type, market) {
  // can't hire army from level 1 villages
  if (building_type == 'village') {
    if (building.level == 0) {
      throw new Meteor.Error("Can't hire soldiers at level 0 villages.")
    }
  }

  // can only buy archers at level 1 village
  if (building_type == 'village' && building.level == 1) {
    if (army.footmen && army.footmen > 0) {
      throw new Meteor.Error("Can't hire footmen at level 1 villages.")
    }
    if (army.pikemen && army.pikemen > 0) {
      throw new Meteor.Error("Can't hire pikemen at level 1 villages.")
    }
    if (army.cavalry && army.cavalry > 0) {
      throw new Meteor.Error("Can't hire cavalry at level 1 villages.")
    }
    if (army.catapults && army.catapults > 0) {
      throw new Meteor.Error("Can't hire catapults at level 1 villages.")
    }
  }

  // don't allow buying cav at level 2 villages
  if (building_type == 'village' && building.level == 2) {
    if (army.cavalry && army.cavalry > 0) {
      throw new Meteor.Error("Can't hire cavalry at level 2 villages.")
    }
    if (army.catapults && army.catapults > 0) {
      throw new Meteor.Error("Can't hire catapults at level 2 villages.")
    }
  }

  // is castle mine for my ally below's
  if (building.playerId != player._id && !_.contains(player.allies_below, building.playerId)) {
    return null;
  }

  // cost of army
  var cost = dArmies.resourceCost(gameId, army)
  cost.gold = 0

  // tax hiring for vassals
  if (player._id != building.playerId) {
    _s.market.types.forEach(function(t) {
      cost[t] = cost[t] * (1 + _s.income.sendToVassalTax);
    })
  }

  // cost of army after needed is bought
  var cost_adjusted = {}
  _s.market.types_plus_gold.forEach(function(t) {
    cost_adjusted[t] = cost[t]
  })

  // resources needed, what we need to buy with gold
  var needed = {}
  _s.market.types.forEach(function(type) {
    needed[type] = 0
  })

  // do we need to buy resrouces?  if so set cost_adjusted
  _s.market.types.forEach(function(type) {
    var dif = cost[type] - player[type]
    if (dif > 0) {
      needed[type] = dif
      cost_adjusted[type] = player[type]
      cost_adjusted.gold += dMarket.total_of_buy_quick(gameId, dif, market[type])
      market[type] = market[type] * Math.pow(_s.market.increment + 1, dif)
    }
  })

  // test if we have enough with cost_adjusted
  _s.market.types_plus_gold.forEach(function(type) {
    if (player[type] < cost_adjusted[type]) {
      throw new Meteor.Error('Not enough resources.')
    }
  })

  // update user
  var playerInc = {}
  _s.market.types_plus_gold.forEach(function(type) {
    playerInc[type] = cost[type] * -1
    if (playerInc[type] > 0) {
      playerInc[type] = 0;
    }
  })

  // update building
  var buildingInc = {}
  _s.armies.types.forEach(function(type) {
    buildingInc[type] = army[type];
    if (buildingInc[type] < 0) {
      buildingInc[type] = 0;
    }
  })

  return {needed:needed, playerInc:playerInc, buildingInc:buildingInc};
};

var buildingCollection = function(building_type) {
  if (building_type == 'castle') {
    return Castles;
  } else if (building_type == 'village') {
    return Villages;
  }
};


// the fields createArmyFromBuilding reads from the building
var armyBuildingFields = function() {
  var fields = {x:1, y:1, playerId:1};
  _s.armies.types.forEach(function(type) {
    fields[type] = 1;
  })
  return fields;
};

// checks the soldiers asked for and returns the $inc that takes them out of
// the building
var takeSoldiersFromBuilding = function(soldiers, building) {
  var hasSoldiers = false;
  var buildingHasEnough = true;
  _s.armies.types.forEach(function(type) {
    if (typeof soldiers[type] != "undefined") {

      check(soldiers[type], Match.Integer);

      if (soldiers[type] > 0) {
        hasSoldiers = true;
      }

      if (soldiers[type] > building[type]) {
        buildingHasEnough = false;
      }

    }
  });
  if (!hasSoldiers) {
    throw new Meteor.Error('no soldiers');
  }

  if (!buildingHasEnough) {
    throw new Meteor.Error('not enough soldiers in building');
  }

  // remove from building
  var inc = {};
  _s.armies.types.forEach(function(type) {
    inc[type] = soldiers[type] * -1;
  });
  return inc;
};


Meteor.methods({

  hireArmy: function(gameId, army, building_id, building_type) {
    check(gameId, String);
    check(army, Object);
    check(building_id, String);
    check(building_type, String);

    var self = this;
    var user_id = Meteor.userId();

    _s.armies.types.forEach(function(type) {
			check(army[type], validNumber)
		})
		check(building_id, String)
		check(building_type, String)

    let find = {gameId:gameId, userId:user_id};
    var collection = buildingCollection(building_type);

    if (this.isSimulation) {
      let player = Players.findOne(find, {fields:hirePlayerFields()});
      if (player) {
        var building = collection && collection.findOne(building_id, {fields: hireBuildingFields()})
        if (building) {
          // get current market prices to test if we have enough gold
          var market = {}
          Market.find({gameId:gameId}).forEach(function(res) {
            market[res.type] = res.price
          })

          var plan = planHire(gameId, army, player, building, building_type, market);
          if (plan) {
            // what is short is bought on the server
            Players.update(player._id, {$inc:plan.playerInc});
            collection.update(building._id, {$inc: plan.buildingInc});
            return true
          }
        }
      }
      throw new Meteor.Error('Error hiring.')
    }

    return (async () => {
      let player = await Players.findOneAsync(find, {fields:hirePlayerFields()});
      if (player) {
        var building = collection && await collection.findOneAsync(building_id, {fields: hireBuildingFields()})
        if (building) {
          // get current market prices to test if we have enough gold
          var market = {}
          for (const res of await Market.find({gameId:gameId}).fetchAsync()) {
            market[res.type] = res.price
          }

          var plan = planHire(gameId, army, player, building, building_type, market);
          if (plan) {
            // sell needed on market
            for (const type of _s.market.types) {
              if (plan.needed[type] > 0) {
                try {
                  await Meteor.callAsync('buy_resource', gameId, type, plan.needed[type]);
                } catch (error) {
                  throw new Meteor.Error(error.error);
                }
              }
            }

            await Players.updateAsync(player._id, {$inc:plan.playerInc});
            await collection.updateAsync(building._id, {$inc: plan.buildingInc});

            // send notification if this is not your building
            if (player._id != building.playerId) {
              var from = player._id;
              var to = building.playerId;
              await dAlerts.alert_receivedArmy(gameId, to, from, army);
              await dAlerts.gAlert_sentArmy(gameId, from, to, army);
            }

            return true
          }
        }
      }
      throw new Meteor.Error('Error hiring.')
    })();
  },



  createArmyFromBuilding: function(gameId, buildingType, buildingId, soldiers) {
    check(gameId, String);
    check(buildingType, String);
    check(buildingId, String);
    check(soldiers, Object);
    var self = this;
    var userId = Meteor.userId();

    if (!userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in.');
    }

    var collection = buildingCollection(buildingType);

    if (this.isSimulation) {
      // client copies of castles and villages don't have gameId
      var buildingFind = {_id:buildingId, user_id:userId};
      var building = collection && collection.findOne(buildingFind, {fields:armyBuildingFields()});
      if (!building) {
        throw new Meteor.Error('no building found');
      }

      // the army is made on the server
      collection.update(buildingFind, {$inc:takeSoldiersFromBuilding(soldiers, building)});
      return;
    }

    return (async () => {
      var buildingFind = {_id:buildingId, user_id:userId, gameId:gameId};
      var building = collection && await collection.findOneAsync(buildingFind, {fields:armyBuildingFields()});
      if (!building) {
        throw new Meteor.Error('no building found');
      }

      // get player before taking soldiers out of the building
      let playerFields = {
        team: 1,
        lord: 1,
        allies_above: 1,
        allies_below: 1,
        king: 1,
        vassals: 1,
        is_dominus: 1,
        userId: 1,
      };
      let find = {gameId:gameId, userId:userId};
      var player = await Players.findOneAsync(find, {fields:playerFields});

      if (!player) {
        throw new Meteor.Error('not-authorized', 'You are not a player in this game.');
      }

      await collection.updateAsync(buildingFind, {$inc:takeSoldiersFromBuilding(soldiers, building)});

      // create army
      var army = await dArmies.create(player._id, soldiers, building.x, building.y);
      if (army) {

        if (await dInit.isEnemyHere(gameId, army.x, army.y, player)) {
          await Queues.addAsyncOrLog('runBattle', {gameId:gameId, x:building.x, y:building.y}, {attempts:10, backoff:{type:'fixed', delay:3000}, delay:0, timeout:1000*60*5}, gameId+'_'+building.x+'_'+building.y);
        }

        return army;

      } else {
        // couldn't create army so give back to building
        await collection.updateAsync(buildingFind, {$inc:soldiers});

        throw new Meteor.Error('could not create army');
      }
    })();
  }
})


if (Meteor.isServer) {
  Meteor.methods({
    disbandArmy: async function(gameId, armyId) {
      check(gameId, String);
      check(armyId, String);
      //this.unblock();
      // only the owner may disband an army -- otherwise any player could
      // delete any opponent's army by id (destroyArmy looks up by _id only).
      var army = await Armies.findOneAsync({_id:armyId, gameId:gameId}, {fields: {user_id:1}});
      if (!army || army.user_id !== this.userId) {
        throw new Meteor.Error('not-authorized', 'You do not own this army.');
      }
      await dArmies.destroyArmy(armyId);
    },


    splitArmy: async function(gameId, armyId, newArmySoldiers) {
      check(newArmySoldiers, Object);
      check(gameId, String);
      check(armyId, String);
      //this.unblock();
      // only the owner may split an army -- dArmies.split looks up by _id only
      // and also resets the army's speed/moveTime, so without this any player
      // could stop and fragment an opponent's army mid-move.
      var army = await Armies.findOneAsync({_id:armyId, gameId:gameId}, {fields: {user_id:1}});
      if (!army || army.user_id !== this.userId) {
        throw new Meteor.Error('not-authorized', 'You do not own this army.');
      }
      var newArmyId = await dArmies.split(gameId, armyId, newArmySoldiers);
      if (newArmyId) {
        return newArmyId;
      } else {
        throw new Meteor.Error('Could not split army.');
      }
    },
  })
}


if (Meteor.isServer) {
  var hireArmyRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'hireArmy'
  }
  DDPRateLimiter.addRule(hireArmyRule, 6, 5000);

  var combineArmiesRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'combineArmies'
  }
  DDPRateLimiter.addRule(combineArmiesRule, 6, 5000);

  var disbandArmyRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'disbandArmy'
  }
  DDPRateLimiter.addRule(disbandArmyRule, 6, 5000);

  var splitArmyRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'splitArmy'
  }
  DDPRateLimiter.addRule(splitArmyRule, 6, 5000);

  var createArmyFromBuildingRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'createArmyFromBuilding'
  }
  DDPRateLimiter.addRule(createArmyFromBuildingRule, 6, 5000);

  var createArmyFromBuildingRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'createArmyFromBuilding'
  }
  DDPRateLimiter.addRule(createArmyFromBuildingRule, 6, 5000);
}
