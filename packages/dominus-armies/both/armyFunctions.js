dArmies.createName = function() {
  var part1 = _s.armies.names.part1[_.random(_s.armies.names.part1.length-1)];
  var part2 = _s.armies.names.part2[_.random(_s.armies.names.part2.length-1)];
  return part1+' '+part2;
}


// return movement speed of army
// how fast army will travel
dArmies.speed_id = function(gameId, armyId) {
  check(armyId, String);
  check(gameId, String);

  var fields = {};

  _s.armies.types.forEach(function(type) {
    fields[type] = 1;
  });

  var army = Armies.findOne(armyId, {fields:fields});
  if (army) {
    return this.speed(gameId, army);
  } else {
    console.error('no army found in speed_id');
  }
}


dArmies.speed = function(gameId, army) {
  check(gameId, String);

  _s.armies.types.forEach(function(type) {
    if (typeof(army[type]) != 'undefined') {
      check(army[type], Match.Integer)
    }
  })

  var armySpeed = Infinity;
  var hasSoldiers = false;
	_s.armies.types.forEach(function(type) {
		if (army[type]) {
      hasSoldiers = true;
      let speed = _gs.armies(gameId, 'stats.'+type+'.speed');
      if (speed < armySpeed) {
				armySpeed = speed;
			}
		}
	});

  if (!hasSoldiers) {
    console.error('army has no soldiers', army);
  }

  if (armySpeed == 0) {
    console.error('armySpeed is 0', army);
    return 0;
  } else {
    return speed = (60 / armySpeed) * _gs.armies(gameId, 'armyTravelMultiplier');
  }
}


dArmies.getUnitBasePower = function(gameId, unit) {
  check(gameId, String);

	var power = {offense:{total:0}, defense:{total:0}}

	_s.armies.types.forEach(function(type) {
		power.offense[type] = 0
		power.defense[type] = 0

		if (unit[type]) {
      let offense = _gs.armies(gameId, 'stats.'+type+'.offense');
      let defense = _gs.armies(gameId, 'stats.'+type+'.defense');
      power.offense[type] = offense * unit[type];
      power.defense[type] = defense * unit[type];

			power.offense.total += offense * unit[type]
			power.defense.total += defense * unit[type]
		}
	})

	return power
}


dArmies.resourceCost = function(gameId, soldiers) {
  check(gameId, String);
  _s.armies.types.forEach(function(type) {
    if (typeof(soldiers[type]) != 'undefined') {
      check(soldiers[type], Match.Integer)
    } else {
      soldiers[type] = 0;
    }
  })

  var cost = {};

  _s.market.types.forEach(function(type) {
    cost[type] = 0;
  });

  _s.armies.types.forEach(function(soldierType) {
    _s.market.types.forEach(function(marketType) {
      cost[marketType] += _s.armies.cost[soldierType][marketType] * soldiers[soldierType];
    })
  })

	return cost;
}


// doesn't take into account that market is not linear
dArmies.worth = function(gameId, soldiers) {
  check(gameId, String);
  
  _s.armies.types.forEach(function(type) {
    if (typeof(soldiers[type]) != 'undefined') {
      check(soldiers[type], Match.Integer)
    }
  })

	var cost = dArmies.resourceCost(gameId, soldiers)
  return dMarket.resourcesToGold(gameId, cost);
}
