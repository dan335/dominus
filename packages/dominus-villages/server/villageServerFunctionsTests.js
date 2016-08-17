stubTestGame = function() {
  Games.remove({});
  let game = {
    _id: 'testgame',
    isSpeed: false,
    hasEnded: false,
    maxPlayers: 200
  }
  game._id = Games.insert(game);
  return game._id;
}



Tinytest.add('villages.buildAndDestroy', function(test) {
  let gameId = stubTestGame();
  Villages.remove({});
  Castles.remove({});
  Armies.remove({});
  Players.remove({});

  Mapmaker.eraseMap(gameId);
  _s.mapmaker.minHexesInCountry = 100;
  _s.mapmaker.maxHexesInCountry = 100;
  Mapmaker.addCountry(gameId, true);

  var hex = Hexes.findOne({type:'grain', hasBuilding:false});

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
  player._id = Players.insert(player);
  // Meteor.userId = function() {
  //   return user._id;
  // }

  // needs to have an army where village is created
  var soldiers = {};
  _s.armies.types.forEach(function(type) {
    soldiers[type] = 0;
  });
  soldiers.footmen = 1;

  dArmies.create(player._id, soldiers, hex.x, hex.y);
  test.equal(Armies.find({gameId:gameId, x:hex.x, y:hex.y}).count(), 1, 'army at hex');

  Meteor.call('buildVillage', gameId, hex.x, hex.y);
  test.equal(Villages.find({gameId:gameId, x:hex.x, y:hex.y, user_id:user._id}).count(), 1, 'village built');
  test.equal(Villages.findOne({gameId:gameId}).footmen, 1, 'footmen inside village');
  test.equal(Armies.find({gameId:gameId, x:hex.x, y:hex.y}).count(), 0, 'army gone');
  test.isNotNull(Villages.findOne({gameId:gameId}).countryId);

  var village = Villages.findOne({gameId:gameId});
  test.equal(village.footmen, soldiers.footmen);

  // destroy
  dVillages.destroyVillage(village._id);
  test.equal(Villages.find({gameId:gameId, x:hex.x, y:hex.y}).count(), 0, 'village destroyed');
  test.equal(Armies.find({gameId:gameId, x:hex.x, y:hex.y}).count(), 1, 'army created after village destroyed');

  // destroy with no army in it
  Meteor.call('buildVillage', gameId, hex.x, hex.y);
  var village = Villages.findOne({gameId:gameId});
  test.isNotUndefined(village);
  test.equal(Villages.find({gameId:gameId, x:hex.x, y:hex.y, user_id:user._id}).count(), 1, 'village created');
  test.equal(Armies.find({gameId:gameId, x:hex.x, y:hex.y}).count(), 0, 'army gone');
  Meteor.call('createArmyFromBuilding', gameId, 'village', village._id, soldiers);
  test.equal(Villages.findOne({gameId:gameId}).footmen, 0, 'army removed from village');
  test.equal(Armies.find({gameId:gameId, x:hex.x, y:hex.y}).count(), 1, 'army created from village');
  dVillages.destroyVillage(village._id);
  test.equal(Villages.find({gameId:gameId, x:hex.x, y:hex.y}).count(), 0, 'village destroyed');
});
