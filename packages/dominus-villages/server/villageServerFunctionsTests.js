stubTestGame = async function() {
  await Games.removeAsync({});
  let game = {
    _id: 'testgame',
    isSpeed: false,
    hasEnded: false,
    maxPlayers: 200
  }
  game._id = await Games.insertAsync(game);
  return game._id;
}



Tinytest.addAsync('villages.buildAndDestroy', async function(test) {
  let gameId = await stubTestGame();
  await Villages.removeAsync({});
  await Castles.removeAsync({});
  await Armies.removeAsync({});
  await Players.removeAsync({});

  await Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 100;
  _s.mapmaker.maxHexesInCountry = 100;
  await Mapmaker.addCountry(gameId, true);

  var hex = await Hexes.findOneAsync({type:'grain', hasBuilding:false});

  // user
  var player = {
    x:0,
    y:0,
    username:'bewb',
    castle_id:1,
    allies_above:[],
    allies_below:[],
    team:[],
    lord:null,
    king:null,
    vassals:[],
    is_dominus:false
  }
  _s.market.types.forEach(function(type) {
    player[type] = 100000;
  })
  player._id = await Players.insertAsync(player);
  // Meteor.userId = function() {
  //   return user._id;
  // }

  // needs to have an army where village is created
  var soldiers = {};
  _s.armies.types.forEach(function(type) {
    soldiers[type] = 0;
  });
  soldiers.footmen = 1;

  await dArmies.create(player._id, soldiers, hex.x, hex.y);
  test.equal(await Armies.find({gameId:gameId, x:hex.x, y:hex.y}).countAsync(), 1, 'army at hex');

  await Meteor.callAsync('buildVillage', gameId, hex.x, hex.y);
  test.equal(await Villages.find({gameId:gameId, x:hex.x, y:hex.y, user_id:user._id}).countAsync(), 1, 'village built');
  test.equal((await Villages.findOneAsync({gameId:gameId})).footmen, 1, 'footmen inside village');
  test.equal(await Armies.find({gameId:gameId, x:hex.x, y:hex.y}).countAsync(), 0, 'army gone');
  test.isNotNull((await Villages.findOneAsync({gameId:gameId})).countryId);

  var village = await Villages.findOneAsync({gameId:gameId});
  test.equal(village.footmen, soldiers.footmen);

  // destroy
  await dVillages.destroyVillage(village._id);
  test.equal(await Villages.find({gameId:gameId, x:hex.x, y:hex.y}).countAsync(), 0, 'village destroyed');
  test.equal(await Armies.find({gameId:gameId, x:hex.x, y:hex.y}).countAsync(), 1, 'army created after village destroyed');

  // destroy with no army in it
  await Meteor.callAsync('buildVillage', gameId, hex.x, hex.y);
  var village = await Villages.findOneAsync({gameId:gameId});
  test.isNotUndefined(village);
  test.equal(await Villages.find({gameId:gameId, x:hex.x, y:hex.y, user_id:user._id}).countAsync(), 1, 'village created');
  test.equal(await Armies.find({gameId:gameId, x:hex.x, y:hex.y}).countAsync(), 0, 'army gone');
  await Meteor.callAsync('createArmyFromBuilding', gameId, 'village', village._id, soldiers);
  test.equal((await Villages.findOneAsync({gameId:gameId})).footmen, 0, 'army removed from village');
  test.equal(await Armies.find({gameId:gameId, x:hex.x, y:hex.y}).countAsync(), 1, 'army created from village');
  await dVillages.destroyVillage(village._id);
  test.equal(await Villages.find({gameId:gameId, x:hex.x, y:hex.y}).countAsync(), 0, 'village destroyed');
});
