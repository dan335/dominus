stubTestGame = async function() {
  await Games.removeAsync({});
  let game = {
    _id: 'testgamemapmaker',
    isSpeed: false,
    hasEnded: false,
    maxPlayers: 200
  }
  game._id = await Games.insertAsync(game);
  return game._id;
}



Tinytest.addAsync('mapmaker.buidingAddedRemoved', async function(test) {
  let gameId = await stubTestGame();
  await Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 600;
  _s.mapmaker.maxHexesInCountry = 600;
  await Mapmaker.addCountry(gameId, true);

  var country = await Countries.findOneAsync({gameId:gameId});
  var hex;

  // defaults
  hex = _.find(country.hexes, function(h) {
    return h.x == 0 && h.y == 0;
  })
  test.isFalse(hex.nearbyBuildings);
  test.isFalse(hex.hasBuilding);

  hex = _.find(country.hexes, function(h) {
    return h.x == 0 && h.y == 5;
  })
  test.isFalse(hex.nearbyBuildings);
  test.isFalse(hex.hasBuilding);

  hex = _.find(country.hexes, function(h) {
    return h.x == 0 && h.y == 10;
  })
  test.isFalse(hex.nearbyBuildings);
  test.isFalse(hex.hasBuilding);

  await Mapmaker.buildingAdded(gameId, 0,0);
  country = await Countries.findOneAsync({gameId:gameId});

  // building at 0,0
  hex = _.find(country.hexes, function(h) {
    return h.x == 0 && h.y == 0;
  })
  test.isTrue(hex.nearbyBuildings);
  test.isTrue(hex.hasBuilding);

  hex = _.find(country.hexes, function(h) {
    return h.x == 0 && h.y == 5;
  })
  test.isTrue(hex.nearbyBuildings);
  test.isFalse(hex.hasBuilding);

  hex = _.find(country.hexes, function(h) {
    return h.x == 0 && h.y == 10;
  })
  test.isFalse(hex.nearbyBuildings);
  test.isFalse(hex.hasBuilding);

  await Mapmaker.buildingRemoved(gameId, 0,0);
  country = await Countries.findOneAsync({gameId:gameId});

  // building rmeoved - return to default
  hex = _.find(country.hexes, function(h) {
    return h.x == 0 && h.y == 0;
  })
  test.isFalse(hex.nearbyBuildings);
  test.isFalse(hex.hasBuilding);

  hex = _.find(country.hexes, function(h) {
    return h.x == 0 && h.y == 5;
  })
  test.isFalse(hex.nearbyBuildings);
  test.isFalse(hex.hasBuilding);

  hex = _.find(country.hexes, function(h) {
    return h.x == 0 && h.y == 10;
  })
  test.isFalse(hex.nearbyBuildings);
  test.isFalse(hex.hasBuilding);

  await Mapmaker.buildingAdded(gameId, 0,0);
});



Tinytest.addAsync('mapmaker.findCountryNeighbors', async function(test) {
  let gameId = await stubTestGame();

  await Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 50;
  _s.mapmaker.maxHexesInCountry = 50;
  await Mapmaker.addCountry(gameId, true);

  var country = await Countries.findOneAsync({gameId:gameId});
  test.isNotUndefined(country.neighbors);
});


Tinytest.addAsync('mapmaker.countryHexesDoNotBelongToMultipleCountries', async function(test) {
  let gameId = await stubTestGame();

  await Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 50;
  _s.mapmaker.maxHexesInCountry = 50;
  await Mapmaker.addCountry(gameId, true);
  await Mapmaker.addCountry(gameId, true);

  await Countries.find({gameId:gameId}).forEachAsync(async function(country) {
    await dTest.eachAsync(country.hexes, async function(hex) {
      var num = await Countries.find({gameId:gameId, hexes: {$elemMatch: {x:hex.x, y:hex.y}}}).countAsync();
      test.equal(num, 1);
    })
  })
});


Tinytest.addAsync('mapmaker.allHexesBelongToOneCountry', async function(test) {
  let gameId = await stubTestGame();
  await Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 50;
  _s.mapmaker.maxHexesInCountry = 50;
  await Mapmaker.addCountry(gameId, true);
  await Mapmaker.addCountry(gameId, true);

  await Hexes.find({gameId:gameId}).forEachAsync(async function(hex) {
    var num = await Countries.find({gameId:gameId, hexes: {$elemMatch: {x:hex.x, y:hex.y}}}).countAsync();
    test.equal(num, 1);
  })
});


Tinytest.addAsync('mapmaker.noDupeHexesInCountry', async function(test) {
  let gameId = await stubTestGame();

  await Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 50;
  _s.mapmaker.maxHexesInCountry = 50;
  await Mapmaker.addCountry(gameId, true);
  await Mapmaker.addCountry(gameId, true);

  await Countries.find().forEachAsync(function(country) {
    _.each(country.hexes, function(hex) {
      var matches = _.filter(country.hexes, function(t) {
        return t.x == hex.x && t.y == hex.y;
      })
      test.equal(matches.length, 1);
    })
  })
})


Tinytest.addAsync('mapmaker.noDuplicateHexCoordinates', async function(test) {
  let gameId = await stubTestGame();

  await Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 50;
  _s.mapmaker.maxHexesInCountry = 150;
  await Mapmaker.addCountry(gameId, true);
  await Mapmaker.addCountry(gameId, true);

  await Hexes.find({gameId:gameId}).forEachAsync(async function(hex) {
    var num = await Hexes.find({gameId:gameId, x:hex.x, y:hex.y, _id:{$ne:hex._id}}).countAsync();
    test.equal(num, 0);
  })
})


Tinytest.addAsync('mapmaker.numberOfHexesCreated', async function(test) {
  let gameId = await stubTestGame();

  await Mapmaker.eraseMap(gameId);
  var num = 15;
  _s.mapmaker.minHexesInCountry = num;
  _s.mapmaker.maxHexesInCountry = num;
  await Mapmaker.addCountry(gameId, true);
  test.equal(await Hexes.find({gameId:gameId}).countAsync(), num);
  test.equal((await Countries.findOneAsync({gameId:gameId})).hexes.length, num);

  await Mapmaker.addCountry(gameId, true);
  test.equal(await Countries.find({gameId:gameId}).countAsync(), 2);
  test.equal(await Hexes.find({gameId:gameId}).countAsync(), num * 2);
});


Tinytest.addAsync('mapmaker.coordsToCountryId', async function(test) {
  let gameId = await stubTestGame();

  await Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 50;
  _s.mapmaker.maxHexesInCountry = 50;
  let countryId = await Mapmaker.addCountry(gameId, true);

  test.equal(await Mapmaker.coordsToCountryId(gameId, 1, 1), countryId);
  test.isNull(await Mapmaker.coordsToCountryId(gameId, 1000, 1000));
});


Tinytest.addAsync('mapmaker.findHexForCastle', async function(test) {
  let gameId = await stubTestGame();

  await Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 100;
  _s.mapmaker.maxHexesInCountry = 100;
  await Mapmaker.addCountry(gameId, true);

  var coords = await Mapmaker.findHexForCastle(gameId);

  test.isTrue(coords !== false, 'is not false');
  test.isTrue(Number(coords.x) === coords.x && coords.x%1 === 0, 'x is integer');
  test.isTrue(Number(coords.y) === coords.y && coords.y%1 === 0, 'y is integer');
  test.equal(await Hexes.find({gameId:gameId, x:coords.x, y:coords.y}).countAsync(), 1, 'does hex exist');
  test.equal(await Armies.find({gameId:gameId, x:coords.x, y:coords.y}).countAsync(), 0, 'is there an army here');
})


// fails because addCountry add a capital
//
Tinytest.addAsync('mapmaker.buildingAdded', async function(test) {
  let gameId = await stubTestGame();

  await Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 100;
  _s.mapmaker.maxHexesInCountry = 100;
  await Mapmaker.addCountry(gameId, true);

  // find hex to test
  var query = {gameId:gameId, isBorder:false, type:'grain', hasBuilding:false, nearbyBuildings:false};
  var num = await Hexes.find(query).countAsync();
  var randNum = Math.floor(Math.random() * num);
  var hex =  await Hexes.findOneAsync(query, {skip:randNum, limit:1});
  test.isNotUndefined(hex, 'found hex');

  // make sure it's false
  test.isFalse(hex.hasBuilding, 'hasBuilding not set');
  test.isFalse(hex.nearbyBuildings, 'nearbyBuildings not set');

  var coords = Hx.getSurroundingHexes(hex.x, hex.y, _s.mapmaker.nearbyBuildingCheckRadius);

  await dTest.eachAsync(coords, async function(coord) {
    var tHex = await Hexes.findOneAsync({gameId:gameId, x:coord.x, y:coord.y})
    if (tHex) {
      test.isFalse((await Hexes.findOneAsync({gameId:gameId, x:coord.x, y:coord.y})).nearbyBuildings, 'hex has nearbyBuildings not set');

      var country = await Countries.findOneAsync(tHex.countryId);
      test.isNotUndefined(country, 'country exists');
      var h = _.find(country.hexes, function(th) {
        return th.x == coord.x && th.y == coord.y;
      })
      test.isFalse(h.nearbyBuildings, 'country hex has nearbyBuildings not set');
    }
  })

  await Mapmaker.buildingAdded(gameId, hex.x, hex.y);

  var hex = await Hexes.findOneAsync(hex._id);
  test.isTrue(hex.hasBuilding, 'hex hasBuilding');
  test.isTrue(hex.nearbyBuildings, 'hex nearbyBuildings');

  await dTest.eachAsync(coords, async function(coord) {
    var tHex = await Hexes.findOneAsync({gameId:gameId, x:coord.x, y:coord.y})
    if (tHex) {
      test.isTrue((await Hexes.findOneAsync({gameId:gameId, x:coord.x, y:coord.y})).nearbyBuildings, 'hex has nearbyBuildings set');

      var country = await Countries.findOneAsync(tHex.countryId);
      var h = _.find(country.hexes, function(ch) {
        return ch.x == coord.x && ch.y == coord.y;
      })

      test.isTrue(h.nearbyBuildings, 'country hex has nearbyBuildings set');
    }
  })
});


Tinytest.addAsync('mapmaker.buildingRemoved', async function(test) {
  let gameId = await stubTestGame();

  await Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 100;
  _s.mapmaker.maxHexesInCountry = 100;
  await Mapmaker.addCountry(gameId, true);

  // find hex to test
  var query = {gameId:gameId, isBorder:false, type:'grain', hasBuilding:false, nearbyBuildings:false};
  var num = await Hexes.find(query).countAsync();
  var randNum = Math.floor(Math.random() * num);
  var hex =  await Hexes.findOneAsync(query, {skip:randNum, limit:1});

  await Mapmaker.buildingAdded(gameId, hex.x, hex.y);
  await Mapmaker.buildingRemoved(gameId, hex.x, hex.y);

  // make sure it's false
  test.isFalse(hex.hasBuilding, 'hasBuilding not set');
  test.isFalse(hex.nearbyBuildings, 'nearbyBuildings not set');

  var coords = Hx.getSurroundingHexes(hex.x, hex.y, _s.mapmaker.nearbyBuildingCheckRadius);

  await dTest.eachAsync(coords, async function(coord) {
    var tHex = await Hexes.findOneAsync({gameId:gameId, x:coord.x, y:coord.y})
    if (tHex) {
      test.isFalse((await Hexes.findOneAsync({gameId:gameId, x:coord.x, y:coord.y})).nearbyBuildings, 'hex has nearbyBuildings not set');

      var country = await Countries.findOneAsync(tHex.countryId);
      test.isNotUndefined(country, 'country exists');
      var h = _.find(country.hexes, function(th) {
        return th.x == coord.x && th.y == coord.y;
      })
      test.isFalse(h.nearbyBuildings, 'country hex has nearbyBuildings not set');
    }
  })
})


Tinytest.addAsync('mapmaker.eraseMap', async function(test) {
  let gameId = await stubTestGame();

  await Hexes.removeAsync({});
  await Countries.removeAsync({});

  await Hexes.insertAsync({gameId:gameId, x:2, y:2});
  await Countries.insertAsync({gameId:gameId, x:1, y:1});
  await Mapmaker.eraseMap(gameId);
  test.equal(await Hexes.find().countAsync(), 0);
  test.equal(await Countries.find().countAsync(), 0);

  await Hexes.insertAsync({gameId:'othergame', x:2, y:2});
  await Countries.insertAsync({gameId:'othergame', x:1, y:1});
  await Mapmaker.eraseMap(gameId);
  test.equal(await Hexes.find().countAsync(), 1);
  test.equal(await Countries.find().countAsync(), 1);
});


Tinytest.addAsync('mapmaker.createHexData', async function(test) {
  let gameId = await stubTestGame();

  await Mapmaker.eraseMap(gameId);
  var hex = await Mapmaker.createHexData(gameId, 0, 0, []);
  test.equal(hex.x, 0);
  test.equal(hex.y, 0);
  test.isNotUndefined(hex.type);
  test.isNotUndefined(hex.large);
  test.isNotUndefined(hex.tileImage);
  test.equal(hex.isBorder, null);
});


Tinytest.addAsync('mapmaker.findStartHexForNewCountry.notAlreadyInACountry', async function(test) {
  let gameId = await stubTestGame();

  await Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 5;
  _s.mapmaker.maxHexesInCountry = 5;
  var num;
  var coords;

  await Mapmaker.addCountry(gameId, true);
  coords = await Mapmaker.findStartHexForNewCountry(gameId);
  num = await Countries.find({gameId:gameId, hexes: {$elemMatch: {x:coords.x, y:coords.y}}}).countAsync();
  test.equal(num, 0);

  for (var n=0; n<4; n++) {
    await Mapmaker.addCountry(gameId, true);
    coords = await Mapmaker.findStartHexForNewCountry(gameId);
    num = await Countries.find({gameId:gameId, hexes: {$elemMatch: {x:coords.x, y:coords.y}}}).countAsync();
    test.equal(num, 0);
  }
})


// Tinytest.add('mapmaker.findBeaches', function(test) {
//   let gameId = stubTestGame();
//
//   Hexes.remove({});
//   var hex = {gameId:gameId, x:0, y:0, isBorder:false};
//   Hexes.insert(hex);
//
//   for (d=0; d<6; d++) {
//     var coord = Hx.getNeighbor(hex.x, hex.y, d);
//     Hexes.insert({gameId:gameId, x:coord.x, y:coord.y, isBorder:true});
//   }
//
//   Mapmaker.findBeaches(gameId);
//
//   Hexes.find().forEach(function(hex) {
//     if (hex.x == 0 && hex.y == 0) {
//       test.isFalse(hex.isBeach);
//     } else {
//       test.isTrue(hex.isBeach);
//     }
//   })
// });


// make sure this works after creating multiple countries
Tinytest.addAsync('mapmaker.multipleFindStartHexForNewCountry', async function(test) {
  let gameId = await stubTestGame();

  await Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 25;
  _s.mapmaker.maxHexesInCountry = 25;
  var num;
  var coords;

  for (var n=0; n<8; n++) {
    await Mapmaker.addCountry(gameId, true);

    coords = await Mapmaker.findStartHexForNewCountry(gameId);

    // check that they're integers
    test.isTrue(Number(coords.x) === coords.x && coords.x%1 === 0);
    test.isTrue(Number(coords.y) === coords.y && coords.y%1 === 0);

    // make sure there is not a hex there
    test.equal(await Hexes.find({gameId:gameId, x:coords.x, y:coords.y}).countAsync(), 0);

    // make sure it's next to another hex
    var found = false;
    for (var d=0; d<6; d++) {
      if (!found) {
        var neighborCoord = Hx.getNeighbor(coords.x, coords.y, d);
        var neighbor = await Hexes.findOneAsync({gameId:gameId, x:neighborCoord.x, y:neighborCoord.y});
        if (neighbor) {
          found = true;
        }
      }
    }
    test.isTrue(found);
  }
});


Tinytest.addAsync('mapmaker.findBorders', async function(test) {
  let gameId = await stubTestGame();

  await Mapmaker.eraseMap(gameId);

  var country = {
    hexes: []
  };

  for (var x=0; x<3; x++) {
    for (var y=0; y<3; y++) {
      var data = {gameId:gameId, x:x, y:y};
      country.hexes.push(data);
    }
  }

  country._id = await Countries.insertAsync(country);

  country.hexes = await dTest.mapAsync(country.hexes, async function(h) {
    h.countryId = country._id;
    h._id = await Hexes.insertAsync(h);
    return h;
  })

  country = Mapmaker.findBorders(country);

  country.hexes.forEach(function(hex) {
    test.isNotUndefined(hex.isBorder);

    if (hex.x == 1 && hex.y == 1) {
      test.isFalse(hex.isBorder);
    } else {
      test.isTrue(hex.isBorder);
    }
  })
});

Tinytest.addAsync('mapmaker.createCountry', async function(test) {
  let gameId = await stubTestGame();

  await Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 50;
  _s.mapmaker.maxHexesInCountry = 50;
  await Mapmaker.addCountry(gameId, true);
  var country = await Countries.findOneAsync({gameId:gameId});

  test.equal(country.hexes.length, _s.mapmaker.minHexesInCountry);
  test.equal(country.numHexes, await Hexes.find({gameId:gameId}).countAsync());
  test.equal(country.hexes.length, await Hexes.find({gameId:gameId}).countAsync());
  test.equal(country.minX, (await Hexes.findOneAsync({gameId:gameId}, {sort:{x:1}})).x);
  test.equal(country.maxX, (await Hexes.findOneAsync({gameId:gameId}, {sort:{x:-1}})).x);
  test.equal(country.minY, (await Hexes.findOneAsync({gameId:gameId}, {sort:{y:1}})).y);
  test.equal(country.maxY, (await Hexes.findOneAsync({gameId:gameId}, {sort:{y:-1}})).y);
})
