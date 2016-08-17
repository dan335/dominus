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


// Tinytest.add('battles.hasBuilding.buildVillageThenDestroy', function(test) {
//   let gameId = stubTestGame();
//
//   Mapmaker.eraseMap(gameId);
//   _s.mapmaker.minHexesInCountry = 60;
//   _s.mapmaker.maxHexesInCountry = 60;
//   Mapmaker.addCountry(gameId, true);
//   Players.remove({});
//
//   Rounds.remove({});
//   Battles2.remove({});
//
//   // find hex to test
//   var find = {gameId:gameId, x:{$ne:0}, y:{$ne:0}, isBorder:false, type:'grain', hasBuilding:false, nearbyBuildings:false};
//   var hex =  Hexes.findOne(find);
//   test.isNotUndefined(hex, 'hex exists');
//
//   // user
//   var player = {
//     x:0,
//     y:0,
//     username:'bewb',
//     castle_id:1,
//     allies_above:[],
//     allies_below:[],
//     team:[],
//     lord:null,
//     king:null,
//     vassals:[],
//     is_dominus:false
//   }
//   _s.market.types.forEach(function(type) {
//     user[type] = 100000;
//   })
//   player._id = Players.insert(user);
//   // Meteor.userId = function() {
//   //   return user._id;
//   // }
//
//   // needs to have an army where village is created
//   var soldiers = {};
//   _s.armies.types.forEach(function(type) {
//     soldiers[type] = 0;
//   });
//   soldiers.footmen = 1;
//
//   dArmies.create(player._id, soldiers, hex.x, hex.y);
//   test.equal(Armies.find({gameId:gameId, x:hex.x, y:hex.y}).count(), 1, 'army at hex');
//
//   // build village
//   Meteor.call('buildVillage', gameId, hex.x, hex.y);
//   test.equal(Villages.find({gameId:gameId, x:hex.x, y:hex.y, user_id:user._id}).count(), 1, 'village built');
//
//   var hex = Hexes.findOne(hex._id);
//   test.isTrue(hex.hasBuilding, 'hex hasBuilding');
//   test.isTrue(hex.nearbyBuildings, 'hex nearbyBuildings');
//
//   var country = Countries.findOne({gameId:gameId});
//   var countryHex = _.find(country.hexes, function(h) {
//     return h.x == hex.x && h.y == hex.y;
//   });
//   test.isNotUndefined(countryHex);
//   test.isTrue(countryHex.hasBuilding, 'hex hasBuilding');
//   test.isTrue(countryHex.nearbyBuildings, 'hex nearbyBuildings');
//
//   // user
//   var player2 = {
//     x:2,
//     y:2,
//     username:'boob',
//     castle_id:2,
//     allies_above:[],
//     allies_below:[],
//     team:[],
//     lord:null,
//     king:null,
//     vassals:[],
//     is_dominus:false
//   }
//   player2._id = Players.insert(player2);
//   // Meteor.userId = function() {
//   //   return user2._id;
//   // }
//
//   var soldiers2 = {};
//   _s.armies.types.forEach(function(type) {
//     soldiers2[type] = 0;
//   });
//   soldiers2.footmen = 10000;
//
//   dArmies.create(player2._id, soldiers2, hex.x, hex.y);
//   test.equal(Armies.find({gameId:gameId, x:hex.x, y:hex.y}).count(), 1, 'army at hex');
//
//   var battle = new BattleJob(gameId, hex.x, hex.y);
//   battle.runBattle();
//
//   // village should be gone
//   // hasBuilding should be false
//   test.isUndefined(Villages.findOne({gameId:gameId}));
//
//   var hex = Hexes.findOne(hex._id);
//   test.isFalse(hex.hasBuilding, 'hex hasBuilding false after village is destroyed');
//   test.isFalse(hex.nearbyBuildings, 'hex nearbyBuildings false after village is destroyed');
//
//   var country = Countries.findOne({gameId:gameId});
//   var countryHex = _.find(country.hexes, function(h) {
//     return h.x == hex.x && h.y == hex.y;
//   });
//   test.isNotUndefined(countryHex);
//   test.isFalse(countryHex.hasBuilding, 'country hex hasBuilding false after village is destroyed');
//   test.isFalse(countryHex.nearbyBuildings, 'country hex nearbyBuildings false after village is destroyed');
// });
