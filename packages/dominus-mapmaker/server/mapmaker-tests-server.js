stubTestGame = function() {
  Games.remove({});
  let game = {
    _id: 'testgamemapmaker',
    isSpeed: false,
    hasEnded: false,
    maxPlayers: 200
  }
  game._id = Games.insert(game);
  return game._id;
}



Tinytest.add('mapmaker.buidingAddedRemoved', function(test) {
  let gameId = stubTestGame();
  Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 600;
  _s.mapmaker.maxHexesInCountry = 600;
  Mapmaker.addCountry(gameId, true);

  var country = Countries.findOne({gameId:gameId});
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

  Mapmaker.buildingAdded(gameId, 0,0);
  country = Countries.findOne({gameId:gameId});

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

  Mapmaker.buildingRemoved(gameId, 0,0);
  country = Countries.findOne({gameId:gameId});

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

  Mapmaker.buildingAdded(gameId, 0,0);
});



Tinytest.add('mapmaker.findCountryNeighbors', function(test) {
  let gameId = stubTestGame();

  Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 50;
  _s.mapmaker.maxHexesInCountry = 50;
  Mapmaker.addCountry(gameId, true);

  var country = Countries.findOne({gameId:gameId});
  test.isNotUndefined(country.neighbors);
});


Tinytest.add('mapmaker.countryHexesDoNotBelongToMultipleCountries', function(test) {
  let gameId = stubTestGame();

  Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 50;
  _s.mapmaker.maxHexesInCountry = 50;
  Mapmaker.addCountry(gameId, true);
  Mapmaker.addCountry(gameId, true);

  Countries.find({gameId:gameId}).forEach(function(country) {
    _.each(country.hexes, function(hex) {
      var num = Countries.find({gameId:gameId, hexes: {$elemMatch: {x:hex.x, y:hex.y}}}).count();
      test.equal(num, 1);
    })
  })
});


Tinytest.add('mapmaker.allHexesBelongToOneCountry', function(test) {
  let gameId = stubTestGame();
  Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 50;
  _s.mapmaker.maxHexesInCountry = 50;
  Mapmaker.addCountry(gameId, true);
  Mapmaker.addCountry(gameId, true);

  Hexes.find({gameId:gameId}).forEach(function(hex) {
    var num = Countries.find({gameId:gameId, hexes: {$elemMatch: {x:hex.x, y:hex.y}}}).count();
    test.equal(num, 1);
  })
});


Tinytest.add('mapmaker.noDupeHexesInCountry', function(test) {
  let gameId = stubTestGame();

  Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 50;
  _s.mapmaker.maxHexesInCountry = 50;
  Mapmaker.addCountry(gameId, true);
  Mapmaker.addCountry(gameId, true);

  Countries.find().forEach(function(country) {
    _.each(country.hexes, function(hex) {
      var matches = _.filter(country.hexes, function(t) {
        return t.x == hex.x && t.y == hex.y;
      })
      test.equal(matches.length, 1);
    })
  })
})


Tinytest.add('mapmaker.noDuplicateHexCoordinates', function(test) {
  let gameId = stubTestGame();

  Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 50;
  _s.mapmaker.maxHexesInCountry = 150;
  Mapmaker.addCountry(gameId, true);
  Mapmaker.addCountry(gameId, true);

  Hexes.find({gameId:gameId}).forEach(function(hex) {
    var num = Hexes.find({gameId:gameId, x:hex.x, y:hex.y, _id:{$ne:hex._id}}).count();
    test.equal(num, 0);
  })
})


Tinytest.add('mapmaker.numberOfHexesCreated', function(test) {
  let gameId = stubTestGame();

  Mapmaker.eraseMap(gameId);
  var num = 15;
  _s.mapmaker.minHexesInCountry = num;
  _s.mapmaker.maxHexesInCountry = num;
  Mapmaker.addCountry(gameId, true);
  test.equal(Hexes.find({gameId:gameId}).count(), num);
  test.equal(Countries.findOne({gameId:gameId}).hexes.length, num);

  Mapmaker.addCountry(gameId, true);
  test.equal(Countries.find({gameId:gameId}).count(), 2);
  test.equal(Hexes.find({gameId:gameId}).count(), num * 2);
});


Tinytest.add('mapmaker.coordsToCountryId', function(test) {
  let gameId = stubTestGame();

  Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 50;
  _s.mapmaker.maxHexesInCountry = 50;
  let countryId = Mapmaker.addCountry(gameId, true);

  test.equal(Mapmaker.coordsToCountryId(gameId, 1, 1), countryId);
  test.isNull(Mapmaker.coordsToCountryId(gameId, 1000, 1000));
});


Tinytest.add('mapmaker.findHexForCastle', function(test) {
  let gameId = stubTestGame();

  Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 100;
  _s.mapmaker.maxHexesInCountry = 100;
  Mapmaker.addCountry(gameId, true);

  var coords = Mapmaker.findHexForCastle(gameId);

  test.isTrue(coords !== false, 'is not false');
  test.isTrue(Number(coords.x) === coords.x && coords.x%1 === 0, 'x is integer');
  test.isTrue(Number(coords.y) === coords.y && coords.y%1 === 0, 'y is integer');
  test.equal(Hexes.find({gameId:gameId, x:coords.x, y:coords.y}).count(), 1, 'does hex exist');
  test.equal(Armies.find({gameId:gameId, x:coords.x, y:coords.y}).count(), 0, 'is there an army here');
})


// fails because addCountry add a capital
//
Tinytest.add('mapmaker.buildingAdded', function(test) {
  let gameId = stubTestGame();

  Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 100;
  _s.mapmaker.maxHexesInCountry = 100;
  Mapmaker.addCountry(gameId, true);

  // find hex to test
  var query = {gameId:gameId, isBorder:false, type:'grain', hasBuilding:false, nearbyBuildings:false};
  var num = Hexes.find(query).count();
  var randNum = Math.floor(Math.random() * num);
  var hex =  Hexes.findOne(query, {skip:randNum, limit:1});
  test.isNotUndefined(hex, 'found hex');

  // make sure it's false
  test.isFalse(hex.hasBuilding, 'hasBuilding not set');
  test.isFalse(hex.nearbyBuildings, 'nearbyBuildings not set');

  var coords = Hx.getSurroundingHexes(hex.x, hex.y, _s.mapmaker.nearbyBuildingCheckRadius);

  _.each(coords, function(coord) {
    var tHex = Hexes.findOne({gameId:gameId, x:coord.x, y:coord.y})
    if (tHex) {
      test.isFalse(Hexes.findOne({gameId:gameId, x:coord.x, y:coord.y}).nearbyBuildings, 'hex has nearbyBuildings not set');

      var country = Countries.findOne(tHex.countryId);
      test.isNotUndefined(country, 'country exists');
      var h = _.find(country.hexes, function(th) {
        return th.x == coord.x && th.y == coord.y;
      })
      test.isFalse(h.nearbyBuildings, 'country hex has nearbyBuildings not set');
    }
  })

  Mapmaker.buildingAdded(gameId, hex.x, hex.y);

  var hex = Hexes.findOne(hex._id);
  test.isTrue(hex.hasBuilding, 'hex hasBuilding');
  test.isTrue(hex.nearbyBuildings, 'hex nearbyBuildings');

  _.each(coords, function(coord) {
    var tHex = Hexes.findOne({gameId:gameId, x:coord.x, y:coord.y})
    if (tHex) {
      test.isTrue(Hexes.findOne({gameId:gameId, x:coord.x, y:coord.y}).nearbyBuildings, 'hex has nearbyBuildings set');

      var country = Countries.findOne(tHex.countryId);
      var h = _.find(country.hexes, function(ch) {
        return ch.x == coord.x && ch.y == coord.y;
      })

      test.isTrue(h.nearbyBuildings, 'country hex has nearbyBuildings set');
    }
  })
});


Tinytest.add('mapmaker.buildingRemoved', function(test) {
  let gameId = stubTestGame();

  Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 100;
  _s.mapmaker.maxHexesInCountry = 100;
  Mapmaker.addCountry(gameId, true);

  // find hex to test
  var query = {gameId:gameId, isBorder:false, type:'grain', hasBuilding:false, nearbyBuildings:false};
  var num = Hexes.find(query).count();
  var randNum = Math.floor(Math.random() * num);
  var hex =  Hexes.findOne(query, {skip:randNum, limit:1});

  Mapmaker.buildingAdded(gameId, hex.x, hex.y);
  Mapmaker.buildingRemoved(gameId, hex.x, hex.y);

  // make sure it's false
  test.isFalse(hex.hasBuilding, 'hasBuilding not set');
  test.isFalse(hex.nearbyBuildings, 'nearbyBuildings not set');

  var coords = Hx.getSurroundingHexes(hex.x, hex.y, _s.mapmaker.nearbyBuildingCheckRadius);

  _.each(coords, function(coord) {
    var tHex = Hexes.findOne({gameId:gameId, x:coord.x, y:coord.y})
    if (tHex) {
      test.isFalse(Hexes.findOne({gameId:gameId, x:coord.x, y:coord.y}).nearbyBuildings, 'hex has nearbyBuildings not set');

      var country = Countries.findOne(tHex.countryId);
      test.isNotUndefined(country, 'country exists');
      var h = _.find(country.hexes, function(th) {
        return th.x == coord.x && th.y == coord.y;
      })
      test.isFalse(h.nearbyBuildings, 'country hex has nearbyBuildings not set');
    }
  })
})


Tinytest.add('mapmaker.eraseMap', function(test) {
  let gameId = stubTestGame();

  Hexes.remove({});
  Countries.remove({});

  Hexes.insert({gameId:gameId, x:2, y:2});
  Countries.insert({gameId:gameId, x:1, y:1});
  Mapmaker.eraseMap(gameId);
  test.equal(Hexes.find().count(), 0);
  test.equal(Countries.find().count(), 0);

  Hexes.insert({gameId:'othergame', x:2, y:2});
  Countries.insert({gameId:'othergame', x:1, y:1});
  Mapmaker.eraseMap(gameId);
  test.equal(Hexes.find().count(), 1);
  test.equal(Countries.find().count(), 1);
});


Tinytest.add('mapmaker.createHexData', function(test) {
  let gameId = stubTestGame();

  Mapmaker.eraseMap(gameId);
  var hex = Mapmaker.createHexData(gameId, 0, 0, []);
  test.equal(hex.x, 0);
  test.equal(hex.y, 0);
  test.isNotUndefined(hex.type);
  test.isNotUndefined(hex.large);
  test.isNotUndefined(hex.tileImage);
  test.equal(hex.isBorder, null);
});


Tinytest.add('mapmaker.findStartHexForNewCountry.notAlreadyInACountry', function(test) {
  let gameId = stubTestGame();

  Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 5;
  _s.mapmaker.maxHexesInCountry = 5;
  var num;
  var coords;

  Mapmaker.addCountry(gameId, true);
  coords = Mapmaker.findStartHexForNewCountry(gameId);
  num = Countries.find({gameId:gameId, hexes: {$elemMatch: {x:coords.x, y:coords.y}}}).count();
  test.equal(num, 0);

  for (var n=0; n<4; n++) {
    Mapmaker.addCountry(gameId, true);
    coords = Mapmaker.findStartHexForNewCountry(gameId);
    num = Countries.find({gameId:gameId, hexes: {$elemMatch: {x:coords.x, y:coords.y}}}).count();
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
Tinytest.add('mapmaker.multipleFindStartHexForNewCountry', function(test) {
  let gameId = stubTestGame();

  Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 25;
  _s.mapmaker.maxHexesInCountry = 25;
  var num;
  var coords;

  for (var n=0; n<8; n++) {
    Mapmaker.addCountry(gameId, true);

    coords = Mapmaker.findStartHexForNewCountry(gameId);

    // check that they're integers
    test.isTrue(Number(coords.x) === coords.x && coords.x%1 === 0);
    test.isTrue(Number(coords.y) === coords.y && coords.y%1 === 0);

    // make sure there is not a hex there
    test.equal(Hexes.find({x:coords.x, y:coords.y}).count(), 0);

    // make sure it's next to another hex
    var found = false;
    for (var d=0; d<6; d++) {
      if (!found) {
        var neighborCoord = Hx.getNeighbor(coords.x, coords.y, d);
        var neighbor = Hexes.findOne({x:neighborCoord.x, y:neighborCoord.y});
        if (neighbor) {
          found = true;
        }
      }
    }
    test.isTrue(found);
  }
});


Tinytest.add('mapmaker.findBorders', function(test) {
  let gameId = stubTestGame();

  Mapmaker.eraseMap(gameId);

  var country = {
    hexes: []
  };

  for (var x=0; x<3; x++) {
    for (var y=0; y<3; y++) {
      var data = {gameId:gameId, x:x, y:y};
      country.hexes.push(data);
    }
  }

  country._id = Countries.insert(country);

  country.hexes = _.map(country.hexes, function(h) {
    h.countryId = country._id;
    h._id = Hexes.insert(h);
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

Tinytest.add('mapmaker.createCountry', function(test) {
  let gameId = stubTestGame();

  Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 50;
  _s.mapmaker.maxHexesInCountry = 50;
  Mapmaker.addCountry(gameId, true);
  var country = Countries.findOne({gameId:gameId});

  test.equal(country.hexes.length, _s.mapmaker.minHexesInCountry);
  test.equal(country.numHexes, Hexes.find({gameId:gameId}).count());
  test.equal(country.hexes.length, Hexes.find({gameId:gameId}).count());
  test.equal(country.minX, Hexes.findOne({gameId:gameId}, {sort:{x:1}}).x);
  test.equal(country.maxX, Hexes.findOne({gameId:gameId}, {sort:{x:-1}}).x);
  test.equal(country.minY, Hexes.findOne({gameId:gameId}, {sort:{y:1}}).y);
  test.equal(country.maxY, Hexes.findOne({gameId:gameId}, {sort:{y:-1}}).y);
})
