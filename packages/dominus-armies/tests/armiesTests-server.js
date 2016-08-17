// run at the beginning of tests
stubTestGame = function() {
  Games.remove({});
  let game = {
    _id: 'testgamearmies',
    isSpeed: false,
    hasEnded: false,
    maxPlayers: 200
  }
  game._id = Games.insert(game);
  return game._id;
}


Tinytest.add('armies.createName', function(test) {
  var name = dArmies.createName();
  test.equal(typeof name, 'string', 'is name a string');
})


Tinytest.add('armies.create', function(test) {
  let gameId = stubTestGame();
  Mapmaker.eraseMap(gameId);
  let player = armiesTestsStubPlayer(gameId);

  _s.mapmaker.minHexesInCountry = 12;
  _s.mapmaker.maxHexesInCountry = 12;
  Mapmaker.addCountry(gameId, true);

  var soldiers = {'footmen':1};

  var army = dArmies.create(player._id, soldiers, 0, 0);
  var army = Armies.findOne();
  test.notEqual(army, false);

  // speed should be set after created
  test.isNotUndefined(army.speed);
  var speed = dArmies.speed(gameId, army);
  test.equal(army.speed, speed);
})


Tinytest.add('armies.speed', function(test) {
  let gameId = stubTestGame();
  Mapmaker.eraseMap(gameId);
  let player = armiesTestsStubPlayer(gameId);

  _s.mapmaker.minHexesInCountry = 12;
  _s.mapmaker.maxHexesInCountry = 12;
  Mapmaker.addCountry(gameId, true);

  var soldiers = {'footmen':1};
  var army = dArmies.create(player._id, soldiers, 0, 0);
  test.equal(Armies.findOne(army._id).speed, (60 / _s.armies.stats.footmen.speed) * _s.armies.armyTravelMultiplier);

  var soldiers = {'cavalry':1};
  var army = dArmies.create(player._id, soldiers, 0, 0);
  test.equal(Armies.findOne(army._id).speed, (60 / _s.armies.stats.cavalry.speed) * _s.armies.armyTravelMultiplier);

  var soldiers = {'cavalry':1, 'footmen':1};
  var army = dArmies.create(player._id, soldiers, 0, 0);
  test.equal(Armies.findOne(army._id).speed, (60 / _s.armies.stats.footmen.speed) * _s.armies.armyTravelMultiplier);

  var soldiers = {'cavalry':1, 'footmen':1, 'catapults':1};
  var army = dArmies.create(player._id, soldiers, 0, 0);
  test.equal(Armies.findOne(army._id).speed, (60 / _s.armies.stats.catapults.speed) * _s.armies.armyTravelMultiplier);
})


// make sure speed is updated after combining
Tinytest.add('armies.splitCombineLastMoveAt', function(test) {
  let gameId = stubTestGame();
  Mapmaker.eraseMap(gameId);
  let player = armiesTestsStubPlayer(gameId);

  Armies.remove({});

  _s.mapmaker.minHexesInCountry = 50;
  _s.mapmaker.maxHexesInCountry = 50;
  Mapmaker.addCountry(gameId, true);

  Meteor.userId = function() {
    return player._id;
  }

  // create army
  var soldiers = {footmen:1, cavalry:1};
  var army = dArmies.create(player._id, soldiers, 0, 0);
  test.equal(Armies.findOne(army._id).speed, (60 / _s.armies.stats.footmen.speed) * _s.armies.armyTravelMultiplier, 'test speed');
  var last_move_at = army.last_move_at;

  // split
  var newArmyId = dArmies.split(gameId, army._id, {cavalry:1});
  test.equal(Armies.findOne(army._id).speed, (60 / _s.armies.stats.footmen.speed) * _s.armies.armyTravelMultiplier, 'test army speed');
  test.equal(Armies.findOne(newArmyId).speed, (60 / _s.armies.stats.cavalry.speed) * _s.armies.armyTravelMultiplier, 'test new army speed');
  test.equal(Armies.findOne(newArmyId).cavalry, 1, 'cav should be 1');
  test.equal(Armies.findOne(army._id).last_move_at, last_move_at, 'army lastMoveAt');
  test.equal(Armies.findOne(newArmyId).last_move_at, last_move_at, 'newarmy lastMoveAt');

  // give path
  var hex = Hexes.findOne({isBorder:true, x:{$ne:army.x}, y:{$ne:army.y}});
  test.isNotUndefined(hex);
  var pathId0 = Meteor.call('addArmyPath', gameId, hex.x, hex.y, newArmyId);

  // combine
  dArmies.methods.combineArmies._execute({userId: 'wee'}, {gameId:gameId, armyId: army._id});
  //dArmies.methods.combineArmies._execute({userId: 'wee'}, {gameId:gameId, armyId: newArmyId});
  test.equal(Armies.find().count(), 1, 'one army after combining');
  var a = Armies.findOne();
  test.equal(a.footmen, 1, 'one foot');
  test.equal(a.cavalry, 1, 'one cav');
  test.equal(a.speed, (60 / _s.armies.stats.footmen.speed) * _s.armies.armyTravelMultiplier, 'speed is correct');
  test.equal(a.last_move_at, last_move_at, 'last move at is correct');
});




// call all methods on armies to make sure last_move_at never changes
// TODO: still need to add some methods
// Tinytest.add('armies.lastMoveAtNeverChanges', function(test) {
//   let gameId = stubTestGame();
//   let player = armiesTestsStubPlayer(gameId);
//
//   Armies.remove({});
//
//   Mapmaker.eraseMap(gameId);
//   _s.mapmaker.minHexesInCountry = 100;
//   _s.mapmaker.maxHexesInCountry = 100;
//
//   dCastles.create(gameId, player._id, true);
//
//   // Meteor.userId = function() {
//   //   return player._id;
//   // }
//
//   // create army
//   var soldiers = {footmen:10, archers:10, pikemen:10, cavalry:10, catapults:10};
//   var army = dArmies.create(player._id, soldiers, 0, 0);
//   var last_move_at = army.last_move_at;
//
//   // split
//   var newArmyId = dArmies.split(gameId, army._id, {cavalry:1});
//   test.equal(Armies.findOne(army._id).last_move_at, last_move_at);
//   test.equal(Armies.findOne(newArmyId).last_move_at, last_move_at);
//
//   // give path
//   var hex = Hexes.findOne({isBorder:true, x:{$ne:army.x}, y:{$ne:army.y}});
//   test.isNotUndefined(hex);
//   var pathId0 = Meteor.call('addArmyPath', gameId, hex.x, hex.y, newArmyId);
//
//   // combine
//   Meteor.call('combineArmies', gameId, newArmyId);
//   test.equal(Armies.find().count(), 1);
//   var army = Armies.findOne();
//   test.equal(army.last_move_at, last_move_at);
//
//   // split
//   var newArmyId = dArmies.split(gameId, army._id, {catapults:1});
//   test.equal(Armies.findOne(army._id).last_move_at, last_move_at);
//   test.equal(Armies.findOne(newArmyId).last_move_at, last_move_at);
//
//   dArmies.joinBuilding(army._id);
//   dArmies.joinBuilding(newArmyId);
//   dArmies.methods.returnToCastle._execute({playerId: player._id}, {armyId: army._id});
//   dArmies.methods.returnToCastle._execute({playerId: player._id}, {armyId: newArmyId});
//   dArmies.methods.stopMoving._execute({playerId: player._id}, {armyId: army._id});
//   dArmies.methods.stopMoving._execute({playerId: player._id}, {armyId: newArmyId});
//
//   // combine
//   Meteor.call('combineArmies', gameId, newArmyId);
//   test.equal(Armies.find().count(), 1);
//   var army = Armies.findOne();
//   test.equal(army.last_move_at, last_move_at);
// });
