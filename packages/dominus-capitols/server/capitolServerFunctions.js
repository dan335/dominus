dCapitals.createCapital = function(gameId, countryId) {
  check(countryId, String);
  check(gameId, String);

  if (Capitals.find({countryId:countryId}).count()) {
    console.error('Country already has a capital.', countryId);
    return false;
  }

  var query = {countryId:countryId, isBorder:false, hasBuilding:false, nearbyBuildings:false};
  var numHexes = Hexes.find(query).count();
  var randNum = Math.floor(Math.random() * numHexes);
  var hex =  Hexes.findOne(query, {skip:randNum, limit:1});

  if (!hex) {
    console.error('Hex to place capital not found in country.', countryId);
    return false;
  }

  Hexes.update(hex._id, {$set:{type:'grain', large:false}});

  var capital = {
    gameId:gameId,
    x:hex.x,
    y:hex.y,
    z:-1 * hex.x - hex.y,
    countryId:countryId,
    playerId:null,
    name: dCapitals.createName(),
    income: {},
    lastIncomeUpdate: new Date()
  };

  _s.armies.types.forEach(function(type) {
    capital[type] = _s.capitals.startingGarrison[type];
  });

  _s.market.types_plus_gold.forEach(function(type) {
    capital.income[type] = 0;
  })

  capital._id = Capitals.insert(capital);

  Countries.update(countryId, {$set:{capitalId:capital._id, capitalPlayerId:null}});

  return capital;
}


dCapitals.createName = function() {
  return _s.capitals.names.part1[_.random(_s.capitals.names.part1.length-1)] + _s.capitals.names.part2[_.random(_s.capitals.names.part2.length-1)];
}


dCapitals.setOwner = function(gameId, playerId, capital_id) {
  check(playerId, String);
  check(gameId, String);

  var capital = Capitals.findOne(capital_id, {fields:{playerId:1}});
  if (capital) {
    if (capital.playerId != playerId) {
      if (capital.playerId) {
        dAlerts.alert_lostCapital(gameId, capital.playerId, capital._id);
      }

      Capitals.update(capital_id, {$set:{playerId:playerId}});
      dAlerts.alert_capturedCapital(gameId, playerId, capital._id);
    }
  }
}
