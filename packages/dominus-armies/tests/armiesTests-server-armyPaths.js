// run at the beginning of tests
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


// Tinytest.add('armies.serverArmyPaths.reorderPathWhileMoving', function(test) {
//   let gameId = stubTestGame();
//   Mapmaker.eraseMap(gameId);
//   _s.mapmaker.minHexesInCountry = 160;
//   _s.mapmaker.maxHexesInCountry = 160;
//   Mapmaker.addCountry(gameId, true);
//
//   _s.armies.armyTravelMultiplier = 0;
//   Armies.remove({});
//   Players.remove({});
//   Armypaths.remove({});
//
//   var player = {username:'bewb', x:0, y:0, lord:null, vassals:[], team:[], allies_above:[], allies_below:[], king:null, castle_id:1, is_dominus:false};
//   player._id = Players.insert(player);
//
//   var soldiers = {'footmen':1};
//
//   var army = dArmies.create(player._id, soldiers, 0, 0);
//   var pathId0 = Meteor.call('addArmyPath', gameId, 4, 0, army._id);
//   var pathId1 = Meteor.call('addArmyPath', gameId, -4, 0, army._id);
//   dArmies.moveArmies();   // move to 1,0
//   dArmies.moveArmies();   // move to 2,0
//   test.equal(Armies.findOne().x, 2);
//   test.equal(Armies.findOne().y, 0);
//   Meteor.call('decreasePathIndex', pathId1);  // start going to path 1
//   test.equal(Armies.findOne().x, 2);
//   test.equal(Armies.findOne().y, 0);
//   dArmies.moveArmies();   // move to 1,0
//   test.equal(Armies.findOne().x, 1);
//   test.equal(Armies.findOne().y, 0);
//   dArmies.moveArmies();   // move to 0,0
//   test.equal(Armies.findOne().x, 0);
//   test.equal(Armies.findOne().y, 0);
//   dArmies.moveArmies();   // move to -1,0
//   dArmies.moveArmies();   // move to -2,0
//   dArmies.moveArmies();   // move to -3,0
//   dArmies.moveArmies();   // move to -4,0
//   test.equal(Armies.findOne().x, -4);
//   test.equal(Armies.findOne().y, 0);
//
//   // reached destination, turn around
//   dArmies.moveArmies();   // move to -3,0
//   test.equal(Armies.findOne().x, -3);
//   test.equal(Armies.findOne().y, 0);
//   dArmies.moveArmies();   // move to -2,0
//   test.equal(Armies.findOne().x, -2);
//   test.equal(Armies.findOne().y, 0);
// });




// Tinytest.add('armies.serverArmyPaths.removePathWhileMoving', function(test) {
//   let gameId = stubTestGame();
//
//   _s.armies.armyTravelMultiplier = 0;
//   Armies.remove({});
//   Players.remove({});
//   Armypaths.remove({});
//
//   Mapmaker.eraseMap(gameId);
//   _s.mapmaker.minHexesInCountry = 160;
//   _s.mapmaker.maxHexesInCountry = 160;
//   Mapmaker.addCountry(gameId, true);
//
//   var player = {username:'bewb', x:0, y:0, lord:null, vassals:[], team:[], allies_above:[], allies_below:[], king:null, castle_id:1, is_dominus:false};
//   player._id = Players.insert(player);
//
//   var soldiers = {'footmen':1};
//
//   var army = dArmies.create(player._id, soldiers, 0, 0);
//   var pathId0 = Meteor.call('addArmyPath', gameId, 4, 0, army._id);
//   var pathId1 = Meteor.call('addArmyPath', gameId, -4, 0, army._id);
//   var pathId2 = Meteor.call('addArmyPath', gameId, 4, 0, army._id);
//   dArmies.moveArmies();   // move to 1,0
//   dArmies.moveArmies();   // move to 2,0
//   test.equal(Armies.findOne().x, 2);
//   test.equal(Armies.findOne().y, 0);
//   Meteor.call('removeArmyPath', pathId0);   // remove first path
//   dArmies.moveArmies();   // move to 1,0
//   test.equal(Armies.findOne().x, 1);
//   test.equal(Armies.findOne().y, 0);
// });



// Tinytest.add('armies.serverArmyPaths.moveArmy', function(test) {
//   let gameId = stubTestGame();
//
//   _s.armies.armyTravelMultiplier = 0;
//   Armies.remove({});
//   Players.remove({});
//   Armypaths.remove({});
//
//   Mapmaker.eraseMap(gameId);
//   _s.mapmaker.minHexesInCountry = 50;
//   _s.mapmaker.maxHexesInCountry = 50;
//   Mapmaker.addCountry(gameId, true);
//
//   var player = {username:'bewb', x:0, y:0, lord:null, vassals:[], team:[], allies_above:[], allies_below:[], king:null, castle_id:1, is_dominus:false};
//   player._id = Players.insert(player);
//
//   var soldiers = {'footmen':1};
//
//   var army = dArmies.create(player._id, soldiers, 0, 0);
//   test.equal(Armies.findOne().x, 0);
//   test.equal(Armies.findOne().y, 0);
//   var pathId = Meteor.call('addArmyPath', gameId, 1, 0, army._id);
//   test.isUndefined(Armypaths.findOne().hexes);
//   Armypaths.update({}, {$set:{last_move_at:new Date(0)}});
//   Armies.update({}, {$set:{last_move_at:new Date(0)}});
//
//   // call once to find path
//   dArmies.moveArmies();
//   test.equal(Armies.findOne().x, 1);
//   test.equal(Armies.findOne().y, 0);
// })


// Tinytest.add('armies.serverArmyPaths.addArmyPath', function(test) {
//   let gameId = stubTestGame();
//
//   _s.armies.armyTravelMultiplier = 0.0000001;
//   Armies.remove({});
//   Players.remove({});
//   Armypaths.remove({});
//   Hexes.remove({});
//
//   Mapmaker.eraseMap(gameId);
//   _s.mapmaker.minHexesInCountry = 300;
//   _s.mapmaker.maxHexesInCountry = 300;
//   Mapmaker.addCountry(gameId, true);
//
//   var player = {username:'bewb', x:0, y:0, lord:null, vassals:[], team:[], allies_above:[], allies_below:[], king:null, castle_id:1, is_dominus:false};
//   player._id = Players.insert(player);
//   var soldiers = {'footmen':1};
//   var army = dArmies.create(player._id, soldiers, 0, 0);
//
//   var pathId = Meteor.call('addArmyPath', gameId, 3, 3, army._id);
//   test.equal(Armypaths.find().count(), 1);
//   var path = Armypaths.findOne();
//   test.equal(path.index, 0);
//   test.equal(path.x, 3);
//   test.equal(path.y, 3);
//   //test.equal(path.user_id, user._id, 'user_id');  // stub Meteor.userId to do this
//   test.equal(path.armyId, army._id, 'armyId');
//   test.equal(moment(new Date(path.createdAt)).isValid(), true);
//   test.equal(moment(new Date(path.last_move_at)).isValid(), true);
//   test.isNotUndefined(path.speed);
//   test.isNotNaN(path.speed);
//   test.equal(pathId, Armypaths.findOne()._id);
//
//   // can't add duplicate
//   test.throws(function() {
//     Meteor.call('addArmyPath', gameId, 3, 3, army._id);
//   }, 'validation-error');
//
//   // correct index
//   //Hexes.insert({gameId, x:3, y:5});
//   Meteor.call('addArmyPath', gameId, 3, 5, army._id);
//   test.equal(Armypaths.find().count(), 2);
//   test.equal(Armypaths.find({index:0}).count(), 1);
//   test.equal(Armypaths.find({index:1}).count(), 1);
//
//   // speed should be set
//   var speed = dArmies.speed(gameId, army);
//   test.isNotUndefined(Armypaths.findOne().speed);
//   test.equal(Armypaths.findOne().speed, speed);
// });


// Tinytest.add('armies.serverArmyPaths.removeArmyPath', function(test) {
//   let gameId = stubTestGame();
//
//   _s.armies.armyTravelMultiplier = 0;
//   Armies.remove({});
//   Players.remove({});
//   Armypaths.remove({});
//   Hexes.remove({});
//
//   var player = {username:'bewb', x:0, y:0, lord:null, vassals:[], team:[], allies_above:[], allies_below:[], king:null, castle_id:1, is_dominus:false};
//   player._id = Players.insert(player);
//   var soldiers = {'footmen':1};
//   var army = dArmies.create(player._id, soldiers, 0, 0);
//
//   Hexes.insert({gameId:gameId, x:3, y:3});
//   var pathId = Meteor.call('addArmyPath', gameId, 3, 3, army._id);
//   test.equal(Armypaths.find().count(), 1);
//
//   Meteor.call('removeArmyPath', pathId);
//   test.equal(Armypaths.find().count(), 0);
//
//   // index
//   Armypaths.remove({});
//   var pathId0 = Meteor.call('addArmyPath', gameId, 3, 3, army._id);
//   Hexes.insert({gameId:gameId, x:4, y:4});
//   var pathId1 = Meteor.call('addArmyPath', gameId, 4, 4, army._id);
//   test.equal(Armypaths.findOne(pathId0).index, 0);
//   Meteor.call('removeArmyPath', pathId1);
//   test.equal(Armypaths.findOne(pathId0).index, 0);
//
//   var pathId1 = Meteor.call('addArmyPath', gameId, 4, 4, army._id);
//   test.equal(Armypaths.findOne(pathId1).index, 1);
//   Meteor.call('removeArmyPath', pathId0);
//   test.equal(Armypaths.findOne(pathId1).index, 0);
//
//   // index
//   Armypaths.remove({});
//   var pathId0 = Meteor.call('addArmyPath', gameId, 3, 3, army._id);
//   var pathId1 = Meteor.call('addArmyPath', gameId, 4, 4, army._id);
//   Hexes.insert({gameId:gameId, x:5, y:5});
//   var pathId2 = Meteor.call('addArmyPath', gameId, 5, 5, army._id);
//   test.equal(Armypaths.findOne(pathId0).index, 0);
//   test.equal(Armypaths.findOne(pathId1).index, 1);
//   test.equal(Armypaths.findOne(pathId2).index, 2);
//   Meteor.call('removeArmyPath', pathId1);
//   test.equal(Armypaths.findOne(pathId0).index, 0);
//   test.equal(Armypaths.findOne(pathId2).index, 1);
// });

// Tinytest.add('armies.serverArmyPaths.decreasePathIndex.toZero', function(test) {
//   let gameId = stubTestGame();
//
//   _s.armies.armyTravelMultiplier = 0;
//   Armies.remove({});
//   Players.remove({});
//   Armypaths.remove({});
//   Hexes.remove({});
//
//   var player = {username:'bewb', x:0, y:0, lord:null, vassals:[], team:[], allies_above:[], allies_below:[], king:null, castle_id:1, is_dominus:false};
//   player._id = Players.insert(player);
//   var soldiers = {'footmen':1};
//   var army = dArmies.create(player._id, soldiers, 0, 0);
//
//   // make sure last_move_at is set
//   Hexes.insert({gameId:gameId, x:3, y:3});
//   var pathId0 = Meteor.call('addArmyPath', gameId, 3, 3, army._id);
//   Hexes.insert({gameId:gameId, x:4, y:4});
//   var pathId1 = Meteor.call('addArmyPath', gameId, 4, 4, army._id);
//   test.isNotUndefined(Armypaths.findOne(pathId0).last_move_at);
//   var last_move_at = Armypaths.findOne(pathId0).last_move_at;
//   Meteor.call('decreasePathIndex', pathId1);
//   test.isNotUndefined(Armypaths.findOne(pathId1).last_move_at);
//   test.equal(Armypaths.findOne(pathId1).last_move_at, last_move_at);
// });
//
// Tinytest.add('armies.serverArmyPaths.increasePathIndex.fromZero', function(test) {
//   let gameId = stubTestGame();
//
//   _s.armies.armyTravelMultiplier = 0;
//   Armies.remove({});
//   Players.remove({});
//   Armypaths.remove({});
//   Hexes.remove({});
//
//   var player = {username:'bewb', x:0, y:0, lord:null, vassals:[], team:[], allies_above:[], allies_below:[], king:null, castle_id:1, is_dominus:false};
//   player._id = Players.insert(player);
//   var soldiers = {'footmen':1};
//   var army = dArmies.create(player._id, soldiers, 0, 0);
//
//   // make sure last_move_at is set
//   Hexes.insert({gameId:gameId, x:3, y:3});
//   Hexes.insert({gameId:gameId, x:4, y:4});
//   var pathId0 = Meteor.call('addArmyPath', gameId, 3, 3, army._id);
//   var pathId1 = Meteor.call('addArmyPath', gameId, 4, 4, army._id);
//   Meteor.call('increasePathIndex', pathId0);
//   test.isNotUndefined(Armypaths.findOne(pathId1).last_move_at);
// });


// Tinytest.add('armies.serverArmyPaths.decreasePathIndex', function(test) {
//   let gameId = stubTestGame();
//
//   _s.armies.armyTravelMultiplier = 0;
//   Armies.remove({});
//   Players.remove({});
//   Armypaths.remove({});
//   Hexes.remove({});
//
//   var player = {username:'bewb', x:0, y:0, lord:null, vassals:[], team:[], allies_above:[], allies_below:[], king:null, castle_id:1, is_dominus:false};
//   player._id = Players.insert(player);
//   var soldiers = {'footmen':1};
//   var army = dArmies.create(player._id, soldiers, 0, 0);
//
//   Hexes.insert({gameId:gameId, x:3, y:3});
//   Hexes.insert({gameId:gameId, x:4, y:4});
//   Hexes.insert({gameId:gameId, x:5, y:5});
//   Hexes.insert({gameId:gameId, x:6, y:6});
//   var pathId0 = Meteor.call('addArmyPath', gameId, 3, 3, army._id);
//   var pathId1 = Meteor.call('addArmyPath', gameId, 4, 4, army._id);
//   var pathId2 = Meteor.call('addArmyPath', gameId, 5, 5, army._id);
//   var pathId3 = Meteor.call('addArmyPath', gameId, 6, 6, army._id);
//   test.equal(Armypaths.findOne(pathId0).index, 0);
//   test.equal(Armypaths.findOne(pathId1).index, 1);
//   test.equal(Armypaths.findOne(pathId2).index, 2);
//   test.equal(Armypaths.findOne(pathId3).index, 3);
//   Meteor.call('decreasePathIndex', pathId2);
//   test.equal(Armypaths.findOne(pathId0).index, 0);
//   test.equal(Armypaths.findOne(pathId1).index, 2);
//   test.equal(Armypaths.findOne(pathId2).index, 1);
//   test.equal(Armypaths.findOne(pathId3).index, 3);
//
//   // make sure hex path was reset
//   Armypaths.update(pathId1, {$set:{hexes:['asdf', 'asdf']}});
//   Armypaths.update(pathId2, {$set:{hexes:['asdf', 'asdf']}});
//   Meteor.call('decreasePathIndex', pathId1);
//   test.equal(Armypaths.findOne(pathId1).hexes, null);
//   test.equal(Armypaths.findOne(pathId2).hexes, null);
// });
//
//
//
// Tinytest.add('armies.serverArmyPaths.increasePathIndex', function(test) {
//   let gameId = stubTestGame();
//
//   _s.armies.armyTravelMultiplier = 0;
//   Armies.remove({});
//   Players.remove({});
//   Armypaths.remove({});
//   Hexes.remove({});
//
//   var player = {username:'bewb', x:0, y:0, lord:null, vassals:[], team:[], allies_above:[], allies_below:[], king:null, castle_id:1, is_dominus:false};
//   player._id = Players.insert(player);
//   var soldiers = {'footmen':1};
//   var army = dArmies.create(player._id, soldiers, 0, 0);
//
//   Hexes.insert({gameId:gameId, x:3, y:3});
//   Hexes.insert({gameId:gameId, x:4, y:4});
//   Hexes.insert({gameId:gameId, x:5, y:5});
//   Hexes.insert({gameId:gameId, x:6, y:6});
//   var pathId0 = Meteor.call('addArmyPath', gameId, 3, 3, army._id);
//   var pathId1 = Meteor.call('addArmyPath', gameId, 4, 4, army._id);
//   var pathId2 = Meteor.call('addArmyPath', gameId, 5, 5, army._id);
//   var pathId3 = Meteor.call('addArmyPath', gameId, 6, 6, army._id);
//   test.equal(Armypaths.findOne(pathId0).index, 0);
//   test.equal(Armypaths.findOne(pathId1).index, 1);
//   test.equal(Armypaths.findOne(pathId2).index, 2);
//   test.equal(Armypaths.findOne(pathId3).index, 3);
//   Meteor.call('increasePathIndex', pathId1);
//   test.equal(Armypaths.findOne(pathId0).index, 0);
//   test.equal(Armypaths.findOne(pathId1).index, 2);
//   test.equal(Armypaths.findOne(pathId2).index, 1);
//   test.equal(Armypaths.findOne(pathId3).index, 3);
//
//   // make sure hex path was reset
//   Armypaths.update(pathId1, {$set:{hexes:['asdf', 'asdf']}});
//   Armypaths.update(pathId2, {$set:{hexes:['asdf', 'asdf']}});
//   Meteor.call('increasePathIndex', pathId2);
//   test.equal(Armypaths.findOne(pathId1).hexes, null);
//   test.equal(Armypaths.findOne(pathId2).hexes, null);
// });
