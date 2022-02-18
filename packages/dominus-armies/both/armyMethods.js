Meteor.methods({

  hireArmy: function(gameId, army, building_id, building_type) {
    check(gameId, String);
    check(building_id, String);
    check(building_type, String);

    var self = this;
    var user_id = Meteor.userId();

    _s.armies.types.forEach(function(type) {
			check(army[type], validNumber)
		})
		check(building_id, String)
		check(building_type, String)

		var userFields = {username:1, x:1, y:1, allies_below:1, castle_id:1}

    _s.market.types_plus_gold.forEach(function(type) {
			userFields[type] = 1
		})

    let find = {gameId:gameId, userId:user_id};
    let player = Players.findOne(find, {fields:userFields});
		if (player) {
			var fields = {playerId:1}
			_s.armies.types.forEach(function(type) {
				fields[type] = 1
			})

			if (building_type == 'castle') {
				var building = Castles.findOne(building_id, {fields: fields})
			} else if (building_type == 'village') {
				var building = Villages.findOne(building_id, {fields: fields})
			}

			if (building) {
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
				if (building.playerId == player._id || _.contains(player.allies_below, building.playerId)) {

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

					// get current market prices to test if we have enough gold
					var market = {}
					Market.find({gameId:gameId}).forEach(function(res) {
						market[res.type] = res.price
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


					// sell needed on market
          _s.market.types.forEach(function(type) {
						if (needed[type] > 0) {
							var result = Meteor.call('buy_resource', gameId, type, needed[type], function(error, result) {
                if (error) {
                  throw new Meteor.Error(error.error);
                }
              })
						}
					})

					// update user
					var inc = {}
          _s.market.types_plus_gold.forEach(function(type) {
						inc[type] = cost[type] * -1
            if (inc[type] > 0) {
              inc[type] = 0;
            }
					})
          Players.update(player._id, {$inc:inc});

					// update building
					var inc = {}
					_s.armies.types.forEach(function(type) {
						inc[type] = army[type];
            if (inc[type] < 0) {
              inc[type] = 0;
            }
					})

          if (building_type == 'castle') {
						Castles.update(building._id, {$inc: inc});
					} else if (building_type == 'village') {
						Villages.update(building._id, {$inc: inc});
					}

					// send notification if this is not your building
          if (!self.isSimulation) {
    				if (player._id != building.playerId) {

    					var from = player._id;
    					var to = building.playerId;
    					dAlerts.alert_receivedArmy(gameId, to, from, army);
    					dAlerts.gAlert_sentArmy(gameId, from, to, army);
    				}
          }

					return true
				}
			}
		}
		throw new Meteor.Error('Error hiring.')
  },





  disbandArmy: function(gameId, armyId) {
    check(gameId, String);
    check(armyId, String);
    //this.unblock();
    if (!this.isSimulation) {
      dArmies.destroyArmy(armyId);
    }
  },


  splitArmy: function(gameId, armyId, newArmySoldiers) {
    check(gameId, String);
    check(armyId, String);
    //this.unblock();
    if (!this.isSimulation) {
      var newArmyId = dArmies.split(gameId, armyId, newArmySoldiers);
      if (newArmyId) {
        return newArmyId;
      } else {
        throw new Meteor.Error('Could not split army.');
      }
    }
  },



  createArmyFromBuilding: function(gameId, buildingType, buildingId, soldiers) {
    check(gameId, String);
    var userId = Meteor.userId();

    // get building
    var building;
    var fields = {x:1, y:1, playerId:1};
    _s.armies.types.forEach(function(type) {
      fields[type] = 1;
    })
    switch (buildingType) {
      case 'castle':
        building = Castles.findOne({_id:buildingId, user_id:userId}, {fields:fields});
        break;
      case 'village':
        building = Villages.findOne({_id:buildingId, user_id:userId}, {fields:fields});
        break;
    }

    if (!building) {
      throw new Meteor.Error('no building found');
    }

    // check soldiers
    var hasSoldiers = false;
    var buildingHasEnough = true;
    _s.armies.types.forEach(function(type) {
      if (typeof(soldiers[type] != "undefined")) {

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
    switch (buildingType) {
      case 'castle':
        Castles.update({_id:buildingId, user_id:userId}, {$inc:inc});
        break;
      case 'village':
        Villages.update({_id:buildingId, user_id:userId}, {$inc:inc});
        break;
    }

    if (!this.isSimulation) {

      // get player
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
      let player = Players.findOne(find, playerFields);

      if (player) {
        // create army
        var army = dArmies.create(player._id, soldiers, building.x, building.y);
        if (army) {

          if (dInit.isEnemyHere(gameId, army.x, army.y, player)) {
            Queues.add('runBattle', {gameId:gameId, x:building.x, y:building.y}, {attempts:10, backoff:{type:'fixed', delay:3000}, delay:0, timeout:1000*60*5}, gameId+'_'+building.x+'_'+building.y);
          }

          return army;

        } else {
          // couldn't create army so give back to building
          switch (buildingType) {
            case 'castle':
              Castles.update({_id:buildingId, user_id:userId}, {$inc:soldiers});
              break;
            case 'village':
              Villages.update({_id:buildingId, user_id:userId}, {$inc:soldiers});
              break;
          }

          throw new Meteor.error('could not create army');
        }

      } else {
        console.error('could not find player in createArmy');
      }
    }
  }
})


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
