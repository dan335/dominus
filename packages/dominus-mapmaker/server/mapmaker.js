Mapmaker = {
  // for king of the hill
  // add hexes to country
  addToCountry: function(gameId, countryId, isTest) {
    check(gameId, String);
    check(isTest, Boolean);

    var self = this;

    let country = Countries.findOne(countryId);
    if (!country) {
      console.error('No country found in addToCountry');
      return false;
    }

    var maxTries = 200;
    var found = false;
		while (!found && maxTries > 0) {
			var coords = this.findStartHexForNewCountry(gameId);
			if (coords) {
        found = true;
        var data = this.createHexesFrom(gameId, coords.x, coords.y, 200, country.hexes);
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
    this.updateCountry(country);
    this.findCountryNeighbors(gameId, country._id);

    if (!isTest) {
      Queues.add('createCountryMask', {countryId:country._id}, {backoff:{type:'fixed', delay:30000}, attempts:10, delay:0, timeout:1000*60*5}, country._id);
      Queues.add('bakeCountry', {countryId:country._id}, {backoff:{type:'fixed', delay:30000}, attempts:10, delay:0, timeout:1000*60*5}, country._id);

			// alert
      var numHexes = Hexes.find({gameId: gameId}).count();
      var numCountries = Countries.find({gameId: gameId}).count();
      // find country center x,y for alert
      var x = Math.round(country.minX + (country.maxX - country.minX)/2);
      var y = Math.round(country.minY + (country.maxY - country.minY)/2);
      dAlerts.gAlert_mapExpanded(gameId, numHexes, numCountries, x, y);
		}

		//console.timeEnd('addCountry');
		return country._id;
  },


  addCountry: function(gameId, isTest) {
		check(gameId, String);
		check(isTest, Boolean);

    var self = this;

		var maxTries = 200;
		var country = null;
		while (!country && maxTries > 0) {
			var coords = this.findStartHexForNewCountry(gameId);
			if (coords) {
				country = this.createCountryHexes(gameId, coords.x, coords.y);
			}
			maxTries--;
		}

		if (!country) {
			console.error('Country not created in addCountry.');
			return false;
		}

		country._id = Random.id();
		country = this.findBorders(country);
    this.saveCountry(country);
    this.findCountryNeighbors(gameId, country._id);

		if (!isTest) {
      Queues.add('createCountryMask', {countryId:country._id}, {backoff:{type:'fixed', delay:30000}, attempts:10, delay:0, timeout:1000*60*5}, country._id);
      Queues.add('bakeCountry', {countryId:country._id}, {backoff:{type:'fixed', delay:30000}, attempts:10, delay:0, timeout:1000*60*5}, country._id);

			// alert
      var numHexes = Hexes.find({gameId: gameId}).count();
      var numCountries = Countries.find({gameId: gameId}).count();
      // find country center x,y for alert
      var x = Math.round(country.minX + (country.maxX - country.minX)/2);
      var y = Math.round(country.minY + (country.maxY - country.minY)/2);
      dAlerts.gAlert_mapExpanded(gameId, numHexes, numCountries, x, y);
		}

		//console.timeEnd('addCountry');
		return country._id;
  },

  // try to create country
  // returns country or false if fails
  createCountryHexes: function(gameId, x, y) {
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

    country.numHexes = Math.floor(Math.random() * (maxHexes - minHexes + 1) + minHexes);
    var data = this.createHexesFrom(gameId, x, y, country.numHexes, []);
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
  updateCountry: function(country) {
    check(country._id, String);

    Hexes.remove({countryId:country._id});

    let fut = Npm.require('fibers/future');
    let future = new fut();
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
			bulk.execute({}, function(error, result) {
	      if (error) {
	        console.error(error);
	      }
	      future.return(result);
	    })

	    var result = future.wait();
		}

		Countries.update(country._id, country);

    return true;
  },



  // give complete country object
  // save to Countries and Hexes using bulk insert
  saveCountry: function(country) {
		check(country._id, String);

    let fut = Npm.require('fibers/future');
    let future = new fut();
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
			bulk.execute({}, function(error, result) {
	      if (error) {
	        console.error(error);
	      }
	      future.return(result);
	    })

	    var result = future.wait();
		}

		Countries.insert(country);

    return true;
  },




  // called from both addCountry and addToCountry
  createHexesFrom: function(gameId, x, y, numHexes, existingHexes) {
    check(gameId, String);
    check(x, validNumber);
    check(y, validNumber);
    check(numHexes, Match.Integer)
    check(existingHexes, Array);

    // create first hex
    var hex = this.createHexData(gameId, x, y, existingHexes);

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

      var hexesToCheck = _.shuffle(existingHexes);
      for (var h=0; h<hexesToCheck.length; h++) {

        if (!newHexCreated) {

          var hexToCheck = hexesToCheck[h];

          // check all sides of hex in random order
          // to see if they're empty
          var directions = _.shuffle([0,1,2,3,4,5]);
          for (var i=0; i<directions.length; i++) {
            if (!newHexCreated) {
              var direction = directions[i];

              // get coordinates of hex at direction
              var coord = Hx.getNeighbor(hexToCheck.x, hexToCheck.y, direction);

              // try to create new hex
              var newHex = this.createHexData(gameId, coord.x, coord.y, existingHexes);

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
  createHexData: function(gameId, x, y, hexes) {
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
    if (Hexes.find({gameId:gameId, x:x, y:y}).count()) {
      //console.error('already hex here', x, y);
      return false;
    }

    // make sure no other country has this hex
    // shouldn't be needed
    if (Countries.find({gameId:gameId, hexes: {$elemMatch: {x:x, y:y}}}).count()) {
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

    var rand = Math.random();

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
      hex.large = Math.random() <= _gs.mapmaker(gameId, 'large');
      //hex.large = Math.random() <= _s.mapmaker.large;
    }

    // pick a random number for which image to use
    if (hex.large) {
      hex.tileImage = '01';
    } else {
      var randNum = Math.floor(Math.random() * _s.mapmaker.numTileImages[hex.type]) + 1;
      randNum = zeroFill(randNum, 2);
      hex.tileImage = randNum;
    }

    return hex;
  },


  coordsToCountryId: function(gameId, x, y) {
		check(gameId, String);
		check(x, Match.Integer);
		check(y, Match.Integer);

		var country = Countries.findOne({gameId:gameId, hexes: {$elemMatch: {x:x, y:y}}}, {fields:{_id:1}});

		if (country) {
      return country._id;
    } else {
      return null;
    }
  },


  buildingAdded: function(gameId, x, y) {
    check(x, Match.Integer);
    check(y, Match.Integer);
		check(gameId, String);

		var fut = Npm.require('fibers/future');
    var futureHexes = new fut();
    var futureCountries = new fut();

    var hexesBulk = Hexes.rawCollection().initializeUnorderedBulkOp();
		var countriesBulk = Countries.rawCollection().initializeUnorderedBulkOp();

		var ret = Mapmaker._buildingAddedBulk(gameId, hexesBulk, countriesBulk, x, y);
		hexesBulk = ret.hexesBulk;
		countriesBulk = ret.countriesBulk;

    hexesBulk.execute({}, function(error, result) {
	    if (error) {
	      console.error(error);
	    }
	    futureHexes.return(result);
	  });
	  futureHexes.wait();

    countriesBulk.execute({}, function(error, result) {
	    if (error) {
	      console.error(error);
	    }
	    futureCountries.return(result);
	  });
	  futureCountries.wait();
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


  buildingRemoved: function(gameId, x, y) {
    check(x, Match.Integer);
    check(y, Match.Integer);
		check(gameId, String);

		var fut = Npm.require('fibers/future');
    var futureHexes = new fut();
    var futureCountries = new fut();
    var hexesBulk = Hexes.rawCollection().initializeOrderedBulkOp();
		var countriesBulk = Countries.rawCollection().initializeOrderedBulkOp();

		hexesBulk.find({gameId:gameId, x:x, y:y}).updateOne({$set:{hasBuilding:false, nearbyBuildings:false}});
		countriesBulk.find({gameId:gameId, hexes: {$elemMatch: {x:x, y:y}}}).updateOne({$set:{"hexes.$.hasBuilding":false, "hexes.$.nearbyBuildings":false}});

		var coords = Hx.getSurroundingHexes(x, y, _s.mapmaker.nearbyBuildingCheckRadius);
    _.each(coords, function(coord) {
			hexesBulk.find({gameId:gameId, x:coord.x, y:coord.y}).updateOne({$set:{nearbyBuildings:false}});
			countriesBulk.find({gameId:gameId, hexes: {$elemMatch: {x:coord.x, y:coord.y}}}).updateOne({$set:{"hexes.$.nearbyBuildings":false}});
    })

		// re-add buildings in this country and neighbors
		var countryId = Mapmaker.coordsToCountryId(gameId, x, y);
		var country = Countries.findOne(countryId, {fields:{neighbors:1}});
		var countryIds = _.union(country.neighbors, [countryId]);
		var find = {countryId: {$in:countryIds}};
		var options = {fields:{x:1, y:1}};

		var coordsToDo = [];

		Castles.find(find, options).forEach(function(building) {
			coordsToDo.push({x:building.x, y:building.y});
		});

		Villages.find(find, options).forEach(function(building) {
			coordsToDo.push({x:building.x, y:building.y});
		});

		Capitals.find(find, options).forEach(function(building) {
			coordsToDo.push({x:building.x, y:building.y});
		});

		coordsToDo.forEach(function(coords) {
			var ret = Mapmaker._buildingAddedBulk(gameId, hexesBulk, countriesBulk, coords.x, coords.y);
			hexesBulk = ret.hexesBulk;
			countriesBulk = ret.countriesBulk;
		})

		// run bulk operations
		hexesBulk.execute({}, function(error, result) {
	    if (error) {
	      console.error(error);
	    }
	    futureHexes.return(result);
	  });
	  futureHexes.wait();

    countriesBulk.execute({}, function(error, result) {
	    if (error) {
	      console.error(error);
	    }
	    futureCountries.return(result);
	  });
	  futureCountries.wait();
  },


  findHexForCastle: function(gameId) {
		check(gameId, String);

    var tries = 0;
    var query = {gameId:gameId, isBorder:false, type:'grain', hasBuilding:false, nearbyBuildings:false};
    var num = Hexes.find(query).count();
    var maxTries = num * 6;

		if (!num) {
			return false;
		}

    while (tries < maxTries) {
      var skip = false;

      var randNum = Math.floor(Math.random() * num);

      var hex =  Hexes.findOne(query, {skip:randNum, limit:1});

      if (!hex) {
        return false;
      }

      if (Armies.find({gameId:gameId, x:hex.x, y:hex.y}).count()) {
        skip = true;
      }

			// shouldn't be needed but just to make sure
			if (Castles.find({gameId:gameId, x:hex.x, y:hex.y}).count()) {
				skip = true;
			}

			if (Villages.find({gameId:gameId, x:hex.x, y:hex.y}).count()) {
				skip = true;
			}

			if (Capitals.find({gameId:gameId, x:hex.x, y:hex.y}).count()) {
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


	findCountryNeighbors: function(gameId, countryId) {
		check(countryId, String);
		check(gameId, String);

    var self = this;

    var neighbors = [];
    var hexes = Hexes.find({isBorder:true, countryId:countryId});
    hexes.forEach(function(hex) {
      for (var d=0; d<6; d++) {
        var testCoords = Hx.getNeighbor(hex.x, hex.y, d);
        var fields = {countryId:1};
        var h = Hexes.findOne({gameId:gameId, x:testCoords.x, y:testCoords.y}, {fields:fields});
        if (h && h.countryId != countryId) {
          neighbors = _.union(neighbors, h.countryId);
        }
      }
    });

		Countries.update(countryId, {$set:{neighbors:neighbors}});

		neighbors.forEach(function(neighbor) {
			Countries.update(neighbor, {$addToSet: {neighbors:countryId}});
		})

	},


  // returns coordinates for hex to start country at
  // find a random border hex
  // get coordinates at random direction that does not already have a hex
  // if no hexes then return 0,0
  findStartHexForNewCountry: function(gameId) {
		check(gameId, String);

    var found = false;

    num = Hexes.find({gameId:gameId, isBorder:true}).count();

    if (!num) {
      return {x:0, y:0};
    }

    var tries = 0;
    var maxTries = num * 4;

    while (!found && tries < maxTries) {
      var randNum = Math.floor(Math.random() * num);
      var find = {isBorder:true, gameId:gameId};
      var hex =  Hexes.findOne(find, {skip:randNum, limit:1});
      if (!hex || typeof hex.x === 'undefined' || typeof hex.y === 'undefined') {
        console.error('no hex found in findStartHexForNewCountry')
        return false;
      }

      var directions = _.shuffle([0,1,2,3,4,5]);
      var coords = null;
      for (var dir in directions) {
        if (!coords) {
          var testCoords = Hx.getNeighbor(hex.x, hex.y, parseInt(dir));
          //console.log(dir+' - '+EJSON.stringify(testCoords))
          if (!Hexes.find({gameId:gameId, x:testCoords.x, y:testCoords.y}).count()) {
            if (!Countries.find({gameId:gameId, hexes: {$elemMatch: {x:testCoords.x, y:testCoords.y}}}).count()) {
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
  eraseMap: function(gameId) {
		check(gameId, String);

    Hexes.remove({gameId:gameId});
    Countries.remove({gameId:gameId});
		CountriesTemp.remove({gameId:gameId});
    Capitals.remove({gameId:gameId});
    Castles.remove({gameId:gameId});
    Villages.remove({gameId:gameId});
    Armies.remove({gameId:gameId});
		Armypaths.remove({gameId:gameId});
		Markers.remove({gameId:gameId});
		MarkerGroups.remove({gameId:gameId});
    Players.remove({gameId:gameId});
  }

}





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
