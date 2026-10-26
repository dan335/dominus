Mapmaker = {
  // for king of the hill
  // add hexes to country
  addToCountry: async function(gameId, countryId, isTest) {
    check(gameId, String);
    check(isTest, Boolean);

    var self = this;

    let country = await Countries.findOneAsync(countryId);
    if (!country) {
      console.error('No country found in addToCountry');
      return false;
    }

    var maxTries = 200;
    var found = false;
		while (!found && maxTries > 0) {
			var coords = await this.findStartHexForNewCountry(gameId);
			if (coords) {
        found = true;
        var data = await this.createHexesFrom(gameId, coords.x, coords.y, 200, country.hexes);
        country.hexes = data.hexes;
        country.minX = Math.min(country.minX, data.minX);
        country.maxX = Math.max(country.maxX, data.maxX);
        country.minY = Math.min(country.minY, data.minY);
        country.maxY = Math.max(country.maxY, data.maxY);
        country.minZ = Math.min(country.minZ, data.minZ);
        country.maxZ = Math.max(country.maxZ, data.maxZ);
			}
			maxTries--;
		}

    if (!country) {
			console.error('Country not created in addToCountry.');
			return false;
		}

    country = this.findBorders(country);
    await this.updateCountry(country);
    await this.findCountryNeighbors(gameId, country._id);

    if (!isTest) {
      await Queues.addAsyncOrLog('createCountryMask', {countryId:country._id}, {backoff:{type:'fixed', delay:30000}, attempts:10, delay:0, timeout:1000*60*5}, country._id);
      await Queues.addAsyncOrLog('bakeCountry', {countryId:country._id}, {backoff:{type:'fixed', delay:30000}, attempts:10, delay:0, timeout:1000*60*5}, country._id);

			// alert
      var numHexes = await Hexes.find({gameId: gameId}).countAsync();
      var numCountries = await Countries.find({gameId: gameId}).countAsync();
      // find country center x,y for alert
      var x = Math.round(country.minX + (country.maxX - country.minX)/2);
      var y = Math.round(country.minY + (country.maxY - country.minY)/2);
      await dAlerts.gAlert_mapExpanded(gameId, numHexes, numCountries, x, y);
		}

		//console.timeEnd('addCountry');
		return country._id;
  },


  addCountry: async function(gameId, isTest) {
		check(gameId, String);
		check(isTest, Boolean);

    var self = this;

		var maxTries = 200;
		var country = null;
		while (!country && maxTries > 0) {
			var coords = await this.findStartHexForNewCountry(gameId);
			if (coords) {
				country = await this.createCountryHexes(gameId, coords.x, coords.y);
			}
			maxTries--;
		}

		if (!country) {
			console.error('Country not created in addCountry.');
			return false;
		}

		country._id = dRandom.id();
		country = this.findBorders(country);
    await this.saveCountry(country);
    await this.findCountryNeighbors(gameId, country._id);

		if (!isTest) {
      await Queues.addAsyncOrLog('createCountryMask', {countryId:country._id}, {backoff:{type:'fixed', delay:30000}, attempts:10, delay:0, timeout:1000*60*5}, country._id);
      await Queues.addAsyncOrLog('bakeCountry', {countryId:country._id}, {backoff:{type:'fixed', delay:30000}, attempts:10, delay:0, timeout:1000*60*5}, country._id);

			// alert
      var numHexes = await Hexes.find({gameId: gameId}).countAsync();
      var numCountries = await Countries.find({gameId: gameId}).countAsync();
      // find country center x,y for alert
      var x = Math.round(country.minX + (country.maxX - country.minX)/2);
      var y = Math.round(country.minY + (country.maxY - country.minY)/2);
      await dAlerts.gAlert_mapExpanded(gameId, numHexes, numCountries, x, y);
		}

		//console.timeEnd('addCountry');
		return country._id;
  },

  // try to create country
  // returns country or false if fails
  createCountryHexes: async function(gameId, x, y) {
    check(x, Match.Integer);
    check(y, Match.Integer);
		check(gameId, String);

    var country = {
			gameId: gameId,
      minX: x,
      maxX: x,
      minY: y,
      maxY: y,
      minZ: -1 * x - y,
      maxZ: -1 * x - y,
      capitalId: null,
      capitalPlayerId: null,
			neighbors: []
    };

    let minHexes = _gs.mapmaker(gameId, 'minHexesInCountry');
    let maxHexes = _gs.mapmaker(gameId, 'maxHexesInCountry');

    country.numHexes = Math.floor(dRandom.fraction() * (maxHexes - minHexes + 1) + minHexes);
    var data = await this.createHexesFrom(gameId, x, y, country.numHexes, []);
    country.hexes = data.hexes;
    country.minX = data.minX;
    country.maxX = data.maxX;
    country.minY = data.minY;
    country.maxY = data.maxY;
    country.minZ = data.minZ;
    country.maxZ = data.maxZ;

    if (!country.hexes) {
      console.error('could not create country hexes in createCountryHexes');
      return false;
    }

    return country;
  },



  // update country instead of inserting
  // add hexes to country
  updateCountry: async function(country) {
    check(country._id, String);

    await Hexes.removeAsync({countryId:country._id});
    await this.markBuildings(country.gameId, country.hexes);

    let bulk = Hexes.rawCollection().initializeUnorderedBulkOp();
		let doBulk = false;

    country.hexes = _.map(country.hexes, function(cHex) {
			doBulk = true;
      cHex.countryId = country._id;
      cHex._id = Hexes._makeNewID();
      bulk.insert(cHex);
      return cHex;
    })

		if (doBulk) {
			await executeBulk(bulk);
		}

		await Countries.updateAsync(country._id, country);

    return true;
  },



  // give complete country object
  // save to Countries and Hexes using bulk insert
  saveCountry: async function(country) {
		check(country._id, String);

    await this.markBuildings(country.gameId, country.hexes);

    let bulk = Hexes.rawCollection().initializeUnorderedBulkOp();
		let doBulk = false;

    country.hexes = _.map(country.hexes, function(cHex) {
			doBulk = true;
      cHex.countryId = country._id;
      cHex._id = Hexes._makeNewID();
      bulk.insert(cHex);
      return cHex;
    })

		if (doBulk) {
			await executeBulk(bulk);
		}

		await Countries.insertAsync(country);

    return true;
  },




  // sets hasBuilding and nearbyBuildings on hexes about to be saved, from
  // the buildings already on the map. A country is added next to others, so
  // its new hexes can be near their castles and capitals (Oct 2026: they used
  // to start with no building nearby, and only buildingRemoved, which redid
  // the whole country and its neighbors, put that right).
  markBuildings: async function(gameId, hexes) {
    check(gameId, String);
    if (!hexes.length) {
      return;
    }

    var radius = _s.mapmaker.nearbyBuildingCheckRadius;
    var xs = _.pluck(hexes, 'x');
    var ys = _.pluck(hexes, 'y');
    var find = {gameId:gameId, x:{$gte:_.min(xs) - radius, $lte:_.max(xs) + radius}, y:{$gte:_.min(ys) - radius, $lte:_.max(ys) + radius}};
    var buildings = [];
    for (const collection of [Castles, Villages, Capitals]) {
      buildings = buildings.concat(await collection.find(find, {fields:{x:1, y:1}}).fetchAsync());
    }

    hexes.forEach(function(hex) {
      hex.hasBuilding = _.some(buildings, function(b) { return b.x == hex.x && b.y == hex.y; });
      hex.nearbyBuildings = _.some(buildings, function(b) { return Hx.hexDistance(b.x, b.y, hex.x, hex.y) <= radius; });
    });
  },


  // called from both addCountry and addToCountry
  createHexesFrom: async function(gameId, x, y, numHexes, existingHexes) {
    check(gameId, String);
    check(x, validNumber);
    check(y, validNumber);
    check(numHexes, Match.Integer)
    check(existingHexes, Array);

    // create first hex
    var hex = await this.createHexData(gameId, x, y, existingHexes);

    var minX = x;
    var maxX = x;
    var minY = y;
    var maxY = y;
    var minZ = -1 * x - y;
    var maxZ = -1 * x - y;

    if (!hex) {
      console.error('could not create first hex of country');
      return false;
    }

    existingHexes.push(hex);

    // create rest of hexes
    for (var n=1; n<numHexes; n++) {

      var newHexCreated = false;

      var hexesToCheck = dRandom.shuffle(existingHexes);
      for (var h=0; h<hexesToCheck.length; h++) {

        if (!newHexCreated) {

          var hexToCheck = hexesToCheck[h];

          // check all sides of hex in random order
          // to see if they're empty
          var directions = dRandom.shuffle([0,1,2,3,4,5]);
          for (var i=0; i<directions.length; i++) {
            if (!newHexCreated) {
              var direction = directions[i];

              // get coordinates of hex at direction
              var coord = Hx.getNeighbor(hexToCheck.x, hexToCheck.y, direction);

              // try to create new hex
              var newHex = await this.createHexData(gameId, coord.x, coord.y, existingHexes);

              if (newHex) {
                existingHexes.push(newHex);
                newHexCreated = true;

                if (newHex.x < minX) {
                  minX = newHex.x;
                }

                if (newHex.x > maxX) {
                  maxX = newHex.x;
                }

                if (newHex.y < minY) {
                  minY = newHex.y;
                }

                if (newHex.y > maxY) {
                  maxY = newHex.y;
                }

                var z = -1 * newHex.x - newHex.y;

                if (z < minZ) {
                  minZ = z;
                }

                if (z > maxZ) {
                  maxZ = z;
                }
              }
            }
          }
        }
      }

      // checked all hexes in country but could not create a new hex
      if (!newHexCreated) {
        return false;
      }
    }

    let data = {
      hexes: existingHexes,
      minX: minX,
      maxX: maxX,
      minY: minY,
      maxY: maxY,
      minZ: minZ,
      maxZ: maxZ
    };

    return data;
  },





  // try to create a hex
  // return false or the hex object that was created
  createHexData: async function(gameId, x, y, hexes) {
		check(gameId, String);

    // is there already a hex there in this country?
    //console.log('trying '+x+','+y)
    var r = _.find(hexes, function(h) {
      return h.x == x && h.y == y;
    });

    if (r) {
      //console.error('already hex here in country createHexData', gameId, x, y);
      return false;
    }

    // is there already a hex here?
    if (await Hexes.find({gameId:gameId, x:x, y:y}).countAsync()) {
      //console.error('already hex here', x, y);
      return false;
    }

    // make sure no other country has this hex
    // shouldn't be needed
    if (await Countries.find({gameId:gameId, hexes: {$elemMatch: {x:x, y:y}}}).countAsync()) {
      //console.error('hex is already in another country', x, y);
      return false;
    }

    // default hex values
    var hex = {
			gameId: gameId,
      x:x,
      y:y,
      z: -1 * x - y,
      type:'grain',
      large:false,
      tileImage: '01',
      isBorder: null,
      hasBuilding: false,
      nearbyBuildings: false
    }

    var rand = dRandom.fraction();

    if (rand >= _s.mapmaker.grain_min && rand <= _s.mapmaker.grain_max) {
      hex.type = 'grain';
    }
    if (rand > _s.mapmaker.lumber_min && rand <= _s.mapmaker.lumber_max) {
      hex.type = 'lumber';
    }
    if (rand > _s.mapmaker.ore_min && rand <= _s.mapmaker.ore_max) {
      hex.type = 'ore';
    }
    if (rand > _s.mapmaker.clay_min && rand <= _s.mapmaker.clay_max) {
      hex.type = 'clay';
    }
    if (rand > _s.mapmaker.glass_min && rand <= _s.mapmaker.glass_max) {
      hex.type = 'glass';
    }
    if (rand > _s.mapmaker.wool_min && rand <= _s.mapmaker.wool_max) {
      hex.type = 'wool';
    }

    // is it a large resource
    if (hex.type != 'grain') {
      hex.large = dRandom.fraction() <= _gs.mapmaker(gameId, 'large');
      //hex.large = Math.random() <= _s.mapmaker.large;
    }

    // pick a random number for which image to use
    if (hex.large) {
      hex.tileImage = '01';
    } else {
      var randNum = Math.floor(dRandom.fraction() * _s.mapmaker.numTileImages[hex.type]) + 1;
      randNum = zeroFill(randNum, 2);
      hex.tileImage = randNum;
    }

    return hex;
  },


  coordsToCountryId: async function(gameId, x, y) {
		check(gameId, String);
		check(x, Match.Integer);
		check(y, Match.Integer);

		var country = await Countries.findOneAsync({gameId:gameId, hexes: {$elemMatch: {x:x, y:y}}}, {fields:{_id:1}});

		if (country) {
      return country._id;
    } else {
      return null;
    }
  },


  buildingAdded: async function(gameId, x, y) {
    check(x, Match.Integer);
    check(y, Match.Integer);
		check(gameId, String);

    var hexesBulk = Hexes.rawCollection().initializeUnorderedBulkOp();
		var countriesBulk = Countries.rawCollection().initializeUnorderedBulkOp();

		var ret = Mapmaker._buildingAddedBulk(gameId, hexesBulk, countriesBulk, x, y);
		hexesBulk = ret.hexesBulk;
		countriesBulk = ret.countriesBulk;

    await executeBulk(hexesBulk);
    await executeBulk(countriesBulk);
  },


	// used in both added and removed
	_buildingAddedBulk: function(gameId, hexesBulk, countriesBulk, x, y) {
		hexesBulk.find({gameId:gameId, x:x, y:y}).updateOne({$set:{hasBuilding:true, nearbyBuildings:true}});
		countriesBulk.find({gameId:gameId, hexes: {$elemMatch: {x:x, y:y}}}).update({$set:{"hexes.$.hasBuilding":true, "hexes.$.nearbyBuildings":true}});

    var coords = Hx.getSurroundingHexes(x, y, _s.mapmaker.nearbyBuildingCheckRadius);
    _.each(coords, function(coord) {
			hexesBulk.find({gameId:gameId, x:coord.x, y:coord.y}).updateOne({$set:{nearbyBuildings:true}});
			countriesBulk.find({gameId:gameId, hexes: {$elemMatch: {x:coord.x, y:coord.y}}}).update({$set:{"hexes.$.nearbyBuildings":true}});
    })

		return {hexesBulk:hexesBulk, countriesBulk:countriesBulk};
	},


  // A building was taken away from x,y: its hex and the hexes within
  // nearbyBuildingCheckRadius of it get hasBuilding and nearbyBuildings from
  // the buildings there now.
  //
  // Battles run at the same time (runBattle's concurrency), so another
  // building nearby can go while this runs. What this read could then be
  // stale by the time it is written: it used to put hasBuilding back on a
  // hex whose village another battle had just destroyed and cleared, and the
  // hex stayed marked for good (found by the 12 hour soak, Oct 2026). So it
  // reads the buildings again after writing, and writes again until two reads
  // agree. Whichever call writes last has read after every change it could
  // have missed, so the hexes end up as the buildings are.
  buildingRemoved: async function(gameId, x, y) {
    check(x, Match.Integer);
    check(y, Match.Integer);
		check(gameId, String);

		var radius = _s.mapmaker.nearbyBuildingCheckRadius;
		var area = [{x:x, y:y}].concat(Hx.getSurroundingHexes(x, y, radius));
		var written = null;

		for (var tries = 0; tries < 10; tries++) {
			var buildings = await Mapmaker._buildingsNear(gameId, x, y, radius * 2);
			var flags = area.map(function(hex) {
				return {
					x: hex.x,
					y: hex.y,
					hasBuilding: _.some(buildings, function(b) { return b.x == hex.x && b.y == hex.y; }),
					nearbyBuildings: _.some(buildings, function(b) { return Hx.hexDistance(b.x, b.y, hex.x, hex.y) <= radius; })
				};
			});

			if (written && _.isEqual(flags, written)) {
				return;
			}

			var hexesBulk = Hexes.rawCollection().initializeUnorderedBulkOp();
			var countriesBulk = Countries.rawCollection().initializeUnorderedBulkOp();
			flags.forEach(function(f) {
				hexesBulk.find({gameId:gameId, x:f.x, y:f.y}).updateOne({$set:{hasBuilding:f.hasBuilding, nearbyBuildings:f.nearbyBuildings}});
				countriesBulk.find({gameId:gameId, hexes: {$elemMatch: {x:f.x, y:f.y}}}).update({$set:{"hexes.$.hasBuilding":f.hasBuilding, "hexes.$.nearbyBuildings":f.nearbyBuildings}});
			});
			await executeBulk(hexesBulk);
			await executeBulk(countriesBulk);
			written = flags;
		}

		console.error('Mapmaker.buildingRemoved: the buildings near ' + x + ',' + y + ' in game ' + gameId + ' kept changing; their hexes may be out of date');
  },


	// the castles, villages and capitals within distance of x,y: [{x, y}]
	_buildingsNear: async function(gameId, x, y, distance) {
		var find = {gameId:gameId, x:{$gte:x - distance, $lte:x + distance}, y:{$gte:y - distance, $lte:y + distance}};
		var options = {fields:{x:1, y:1}};
		var buildings = [];
		for (const collection of [Castles, Villages, Capitals]) {
			for (const building of await collection.find(find, options).fetchAsync()) {
				if (Hx.hexDistance(building.x, building.y, x, y) <= distance) {
					buildings.push({x:building.x, y:building.y});
				}
			}
		}
		return buildings;
	},


  findHexForCastle: async function(gameId) {
		check(gameId, String);

    var tries = 0;
    var query = {gameId:gameId, isBorder:false, type:'grain', hasBuilding:false, nearbyBuildings:false};
    var num = await Hexes.find(query).countAsync();
    var maxTries = num * 6;

		if (!num) {
			return false;
		}

    while (tries < maxTries) {
      var skip = false;

      var randNum = Math.floor(dRandom.fraction() * num);

      var hex =  await Hexes.findOneAsync(query, {skip:randNum, limit:1});

      if (!hex) {
        return false;
      }

      if (await Armies.find({gameId:gameId, x:hex.x, y:hex.y}).countAsync()) {
        skip = true;
      }

			// shouldn't be needed but just to make sure
			if (await Castles.find({gameId:gameId, x:hex.x, y:hex.y}).countAsync()) {
				skip = true;
			}

			if (await Villages.find({gameId:gameId, x:hex.x, y:hex.y}).countAsync()) {
				skip = true;
			}

			if (await Capitals.find({gameId:gameId, x:hex.x, y:hex.y}).countAsync()) {
				skip = true;
			}

			// not needed
      // check for nearby buildings
      // TODO: maybe use x,y,z to do one find instead of many
      // if (!skip) {
      //   var coords = Hx.getSurroundingHexes(hex.x, hex.y, _s.mapmaker.nearbyBuildingCheckRadius);
      //   coords.forEach(function(coord) {
      //     if (!skip) {
      //       var hexHasBuilding = Hexes.find({x:coord.x, y:coord.y, hasBuilding:true}).count();
      //       if (hexHasBuilding) {
      //         skip = true;
      //       }
      //     }
      //   })
      // }

      if (!skip) {
        return {x:hex.x, y:hex.y};
      }

      tries++;
    }

    return false;
  },


	findCountryNeighbors: async function(gameId, countryId) {
		check(countryId, String);
		check(gameId, String);

    var self = this;

    var neighbors = [];
    var hexes = await Hexes.find({isBorder:true, countryId:countryId}).fetchAsync();
    for (const hex of hexes) {
      for (var d=0; d<6; d++) {
        var testCoords = Hx.getNeighbor(hex.x, hex.y, d);
        var fields = {countryId:1};
        var h = await Hexes.findOneAsync({gameId:gameId, x:testCoords.x, y:testCoords.y}, {fields:fields});
        if (h && h.countryId != countryId) {
          neighbors = _.union(neighbors, h.countryId);
        }
      }
    }

		await Countries.updateAsync(countryId, {$set:{neighbors:neighbors}});

		for (const neighbor of neighbors) {
			await Countries.updateAsync(neighbor, {$addToSet: {neighbors:countryId}});
		}

	},


  // returns coordinates for hex to start country at
  // find a random border hex
  // get coordinates at random direction that does not already have a hex
  // if no hexes then return 0,0
  findStartHexForNewCountry: async function(gameId) {
		check(gameId, String);

    var found = false;

    num = await Hexes.find({gameId:gameId, isBorder:true}).countAsync();

    if (!num) {
      return {x:0, y:0};
    }

    var tries = 0;
    var maxTries = num * 4;

    while (!found && tries < maxTries) {
      var randNum = Math.floor(dRandom.fraction() * num);
      var find = {isBorder:true, gameId:gameId};
      var hex =  await Hexes.findOneAsync(find, {skip:randNum, limit:1});
      if (!hex || typeof hex.x === 'undefined' || typeof hex.y === 'undefined') {
        console.error('no hex found in findStartHexForNewCountry')
        return false;
      }

      var directions = dRandom.shuffle([0,1,2,3,4,5]);
      var coords = null;
      for (var dir in directions) {
        if (!coords) {
          var testCoords = Hx.getNeighbor(hex.x, hex.y, parseInt(dir));
          //console.log(dir+' - '+EJSON.stringify(testCoords))
          if (!await Hexes.find({gameId:gameId, x:testCoords.x, y:testCoords.y}).countAsync()) {
            if (!await Countries.find({gameId:gameId, hexes: {$elemMatch: {x:testCoords.x, y:testCoords.y}}}).countAsync()) {
              coords = testCoords;
            }
          }
        }
      }

      if (coords) {
        found = true;
      }
      tries++;
    }

    if (!found) {
      console.error('no coords found in findStartHexForNewCountry after '+maxTries+' tries', gameId);
      return false;
    }

    return coords;
  },


  // mark hexes that are next to water as isBeach
  // used in Shorefinder
  // findBeaches: function(gameId) {
	// 	check(gameId, String);
  //
  //   var fut = Npm.require('fibers/future');
  //   var futureHexes = new fut();
  //   var futureCountries = new fut();
  //   var isBeach;
  //   var hexesBulk = Hexes.rawCollection().initializeUnorderedBulkOp();
  //   var countriesBulk = Countries.rawCollection().initializeUnorderedBulkOp();
  //   var hasBulk = false;
  //   var hasCountriesBulk = false;
  //
  //   Hexes.find({gameId:gameId, isBorder:true}, {fields:{gameId:1, x:1, y:1, isBeach:1}}).forEach(function(hex) {
  //     var direction = Shorefinder.waterDirection(hex);
  //     if (direction !== false) {
  //       isBeach = true;
  //     } else {
  //       isBeach = false;
  //     }
  //     if (hex.isBeach != isBeach) {
  //       hasBulk = true;
  //       hexesBulk.find({_id:hex._id}).updateOne({$set:{isBeach:isBeach}});
  //       countriesBulk.find({gameId:gameId, hexes: {$elemMatch: {_id:hex._id}}}).updateOne({$set:{"hexes.$.isBeach":isBeach}});
  //     }
  //   })
  //
  //   if (hasBulk) {
  //     hexesBulk.execute({}, function(error, result) {
  // 	    if (error) {
  // 	      console.error(error);
  // 	    }
  // 	    futureHexes.return(result);
  // 	  });
  // 	  futureHexes.wait();
  //
  //     countriesBulk.execute({}, function(error, result) {
  // 	    if (error) {
  // 	      console.error(error);
  // 	    }
  // 	    futureCountries.return(result);
  // 	  });
  // 	  futureCountries.wait();
  //   }
  // },


	// mark hexes that are on the edge of the country
  // this can include ones that are around a lake in the middle of the country
	findBorders: function(country) {
		// set default
    country.hexes = _.map(country.hexes, function(hex) {
      hex.isBorder = false;
      return hex;
    })

		country.hexes = _.map(country.hexes, function(hex) {
			var isBorder = false;

			var neighborCoords = Hx.getSurroundingHexes(hex.x, hex.y, 1);
			neighborCoords.forEach(function(coord) {
				if (!isBorder) {
					var exists = _.find(country.hexes, function(h) {
						return h.x == coord.x && h.y == coord.y;
					});
					if (!exists) {
						isBorder = true;
					}
				}
			})

			if (isBorder) {
				hex.isBorder = true;
			}
			return hex;
		});

		return country;
	},


	// only for testing
  eraseMap: async function(gameId) {
		check(gameId, String);

    await Hexes.removeAsync({gameId:gameId});
    await Countries.removeAsync({gameId:gameId});
		await CountriesTemp.removeAsync({gameId:gameId});
    await Capitals.removeAsync({gameId:gameId});
    await Castles.removeAsync({gameId:gameId});
    await Villages.removeAsync({gameId:gameId});
    await Armies.removeAsync({gameId:gameId});
		await Armypaths.removeAsync({gameId:gameId});
		await Markers.removeAsync({gameId:gameId});
		await MarkerGroups.removeAsync({gameId:gameId});
    await Players.removeAsync({gameId:gameId});
  }

}





// runs a bulk op and logs a failure, as its callback did
var executeBulk = async function(bulk) {
  try {
    await bulk.execute();
  } catch (error) {
    console.error(error);
  }
};


// same thing as _.lpad()
// for some reason lpad doesn't work when reseting game
// maybe _. gets overwritten?
var zeroFill = function(number, width)
{
  width -= number.toString().length;
  if ( width > 0 )
  {
    return new Array( width + (/\./.test( number ) ? 2 : 1) ).join( '0' ) + number;
  }
  return number + ""; // always return a string
};
