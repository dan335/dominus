Tinytest.addAsync('mapbaker.findTopAndBottomHexesInImage', async function(test) {
  let gameId = 'testgamemapbaker';

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

  var extents = Mapbaker.findTopAndBottomHexesInImage(country);
  test.equal(extents.topHex.x, 0);
  test.equal(extents.topHex.y, 0);
  test.isNotUndefined(extents.topHex._id);

  test.equal(extents.bottomHex.x, 2);
  test.equal(extents.bottomHex.y, 2);
  test.isNotUndefined(extents.bottomHex._id);

  test.isNotNaN(extents.topPos);
  test.isNotNaN(extents.bottomPos);
})



Tinytest.addAsync('mapbaker.findTopLeftHexInImage', async function(test) {
  let gameId = 'testgamemapbaker2';

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

  country.minX = 0;

  var extents = Mapbaker.findTopAndBottomHexesInImage(country);
  var topLeftCoord = Mapbaker.findTopLeftHexInImage(country, extents);

  test.equal(topLeftCoord.x, 0);
  test.equal(topLeftCoord.y, 0);
});
