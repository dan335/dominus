dCapitals.createCapital = async function(gameId, countryId) {
  check(countryId, String);
  check(gameId, String);

  if (await Capitals.find({countryId:countryId}).countAsync()) {
    console.error('Country already has a capital.', countryId);
    return false;
  }

  var query = {countryId:countryId, isBorder:false, hasBuilding:false, nearbyBuildings:false};
  var numHexes = await Hexes.find(query).countAsync();
  var randNum = Math.floor(dRandom.fraction() * numHexes);
  var hex =  await Hexes.findOneAsync(query, {skip:randNum, limit:1});

  if (!hex) {
    console.error('Hex to place capital not found in country.', countryId);
    return false;
  }

  // a capital stands on grain; the country keeps its own copy of each hex
  await Hexes.updateAsync(hex._id, {$set:{type:'grain', large:false}});
  await Countries.updateAsync({_id:countryId, hexes:{$elemMatch:{x:hex.x, y:hex.y}}}, {$set:{'hexes.$.type':'grain', 'hexes.$.large':false}});

  var capital = {
    gameId:gameId,
    x:hex.x,
    y:hex.y,
    z:-1 * hex.x - hex.y,
    countryId:countryId,
    playerId:null,
    name: dCapitals.createName(),
    income: {},
    lastIncomeUpdate: dClock.now()
  };

  _s.armies.types.forEach(function(type) {
    capital[type] = _gs.capitals(gameId, 'startingGarrison.' + type);
  });

  _s.market.types_plus_gold.forEach(function(type) {
    capital.income[type] = 0;
  })

  capital._id = await Capitals.insertAsync(capital);

  await Countries.updateAsync(countryId, {$set:{capitalId:capital._id, capitalPlayerId:null}});

  return capital;
}


dCapitals.createName = function() {
  return _s.capitals.names.part1[dRandom.random(_s.capitals.names.part1.length-1)] + _s.capitals.names.part2[dRandom.random(_s.capitals.names.part2.length-1)];
}


dCapitals.setOwner = async function(gameId, playerId, capital_id) {
  check(playerId, String);
  check(gameId, String);

  var capital = await Capitals.findOneAsync(capital_id, {fields:{playerId:1}});
  if (capital) {
    if (capital.playerId != playerId) {
      if (capital.playerId) {
        await dAlerts.alert_lostCapital(gameId, capital.playerId, capital._id);
      }

      await Capitals.updateAsync(capital_id, {$set:{playerId:playerId}});
      await dAlerts.alert_capturedCapital(gameId, playerId, capital._id);
    }
  }
}
