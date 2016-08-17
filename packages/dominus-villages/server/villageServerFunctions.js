

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.destroyVillage.process(Meteor.bindEnvironment(function(job) {
    dVillages.destroyVillage(job.data.villageId);
    return Promise.resolve();
  }));
}



dVillages.destroyVillage = function(villageId) {
  check(villageId, String);

  var find = {_id:villageId};
  var options = {fields: {gameId:1, playerId:1, x:1, y:1}};
  _s.armies.types.forEach(function(type) {
    options.fields[type] = 1;
  })

  var village = Villages.findOne(find, options);
  if (!village) {
    return false;
  }

  // create army
  var soldiers = {};
  var hasSoldiers = false;
  _s.armies.types.forEach(function(type) {
    soldiers[type] = village[type];
    if (village[type] > 0) {
      hasSoldiers = true;
    }
  });

  if (hasSoldiers) {
    var army = dArmies.create(village.playerId, soldiers, village.x, village.y, new Date());
    if (!army) {
      return false;
    }
  }

  Villages.remove(villageId);
  Markers.remove({unitType:'village', unitId:villageId});
  Mapmaker.buildingRemoved(village.gameId, village.x, village.y);

  if (army) {
    return army._id;
  } else {
    return null;
  }
}




// does include large hex multiplier
dVillages.resourcesFromSurroundingHexes = function(gameId, x, y, numRings) {
  check(gameId, String);
  check(x, Match.Integer);
  check(y, Match.Integer);
  check(numRings, Match.Integer);

	var hex_array = Hx.getSurroundingHexes(x, y, numRings);

	var income = {};
  _s.market.types.forEach(function(type) {
		income[type] = 0;
	});

	var hexes = Hexes.find({gameId:gameId, x:{$gte: x-numRings, $lte: x+numRings}, y:{$gte: y-numRings, $lte: y+numRings}}, {fields: {x:1, y:1, type:1, large:1}});

	hexes.forEach(function(hex) {
		var h = _.find(hex_array, function(arr) {
      return (hex.x == arr.x && hex.y == arr.y);
		});

		if (h) {
			var mult;
			if (hex.large) {
				mult = _s.villages.large_resource_multiplier;
			} else {
				mult = 1;
			}

      let gained_at_hex = _gs.villages(gameId, 'gained_at_hex');
      let interval = _gs.villages(gameId, 'incomeInterval');
      income[hex.type] += gained_at_hex * interval * mult;
      //income[hex.type] += _s.villages.gained_at_hex * mult;
		}
	});

	return income;
};
