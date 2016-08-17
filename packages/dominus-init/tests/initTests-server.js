stubTestGame = function() {
  Games.remove({});
  let game = {
    _id: 'testgameinit',
    isSpeed: false,
    hasEnded: false,
    maxPlayers: 200
  }
  game._id = Games.insert(game);
  return game._id;
}



// Tinytest.add('init.isEnemyArmyHere', function(test) {
//   let gameId = stubTestGame();
//   Armies.remove({});
//   Meteor.users.remove({});
//
//   Mapmaker.eraseMap(gameId);
//   _s.mapmaker.minHexesInCountry = 10;
//   _s.mapmaker.maxHexesInCountry = 10;
//   Mapmaker.addCountry(gameId, true);
//
//   var hexes = Hexes.find({gameId:gameId}).fetch();
//
//   var player1 = {username:'bewb', x:hexes[0].x, y:hexes[0].y, allies_above:[], allies_below:[], team:[], vassals:[], castle_id:1, lord:null, king:null, is_dominus:false};
//   player1._id = Players.insert(player1);
//
//   var player2 = {username:'boob', x:hexes[1].x, y:hexes[1].y, allies_above:[], allies_below:[], team:[], vassals:[], castle_id:2, lord:null, king:null, is_dominus:false};
//   player2._id = Players.insert(player2);
//
//   var soldiers = {'footmen':1};
//   var armyUser1 = dArmies.create(player1._id, soldiers, hexes[2].x, hexes[2].y);
//   test.isFalse(dInit.isEnemyHere(gameId, hexes[2].x, hexes[2].y, player1));
//
//   // no relation
//   var armyUser2 = dArmies.create(player2._id, soldiers, hexes[2].x, hexes[2].y);
//   test.isTrue(dInit.isEnemyHere(gameId, hexes[2].x, hexes[2].y, player1));
// })


Tinytest.add('init.setLordVassal', function(test) {
  Players.remove({});
  let gameId = stubTestGame();

  let player1 = {_id:'1', allies_above:[], allies_below:[], team:['1'], king:null, is_king:true, gameId:gameId};
  let player2 = {_id:'2', allies_above:[], allies_below:[], team:['2'], king:null, is_king:true, gameId:gameId};

  player1._id = Players.insert(player1);
  player2._id = Players.insert(player2);

  dInit.set_lord_and_vassal(player1._id, player2._id);
  player1 = Players.findOne(player1._id);
  player2 = Players.findOne(player2._id);

  test.isTrue(player1.is_king);
  test.isFalse(player2.is_king);

  test.equal(player2.king, player1._id);
  test.equal(player1.king, player1._id);

  test.equal(player2.allies_above, [player1._id]);
  test.equal(player1.allies_below, [player2._id], 'player1 allies below');
  test.equal(player2.allies_below, [], 'player2 allies below');
  test.equal(player1.allies_above, [], 'player1 allies above');

  test.isTrue(_.contains(player1.team, player2._id), 'player1 team contains player2');
  test.isTrue(_.contains(player1.team, player1._id), 'player1 team contains player1');
  test.isTrue(_.contains(player2.team, player2._id), 'player2 team contains player2');
  test.isTrue(_.contains(player2.team, player1._id), 'player2 team contains player1');
});


Tinytest.add('init.getRelationType.enemy', function(test) {
  Players.remove({});

  var user1 = {_id:'1', allies_above:[], allies_below:[], team:[], vassals:[], castle_id:1, lord:null, king:null, is_dominus:false};
  var user2 = {_id:'2', allies_above:[], allies_below:[], team:[], vassals:[], castle_id:2, lord:null, king:null, is_dominus:false};

  test.equal(dInit.getPlayersRelationship(user1, user2._id), 'enemy');
});


Tinytest.add('init.getRelationType.direct_lord', function(test) {
  Players.remove({});

  var user1 = {_id:'1', allies_above:[], allies_below:[], team:[], vassals:[], castle_id:1, lord:null, king:null, is_dominus:false};
  var user2 = {_id:'2', allies_above:[], allies_below:[], team:[], vassals:[], castle_id:2, lord:null, king:null, is_dominus:false};

  user1.lord = user2._id;
  user1.allies_above = [user2._id];
  user1.team = [user2._id];

  user2.vassals = [user1._id];
  user2.allies_below = [user1._id];
  user2.team = [user2._id];

  test.equal(dInit.getPlayersRelationship(user1, user2._id), 'direct_lord');
});


Tinytest.add('init.getRelationType.lord', function(test) {
  Players.remove({});

  var user1 = {_id:'1', allies_above:[], allies_below:[], team:[], vassals:[], castle_id:1, lord:null, king:null, is_dominus:false};
  var user2 = {_id:'2', allies_above:[], allies_below:[], team:[], vassals:[], castle_id:2, lord:null, king:null, is_dominus:false};

  // 3 is inbetween
  user1.lord = '3';
  user1.allies_above = [user2._id, '3'];
  user1.team = [user2._id, '3'];

  user2.vassals = ['3'];
  user2.allies_below = [user1._id, '3'];
  user2.team = [user2._id, '3'];

  test.equal(dInit.getPlayersRelationship(user1, user2._id), 'lord');
});


Tinytest.add('init.getRelationType.enemy_ally', function(test) {
  Players.remove({});

  var user1 = {_id:'1', allies_above:[], allies_below:[], team:[], vassals:[], castle_id:1, lord:null, king:null, is_dominus:false};
  var user2 = {_id:'2', allies_above:[], allies_below:[], team:[], vassals:[], castle_id:2, lord:null, king:null, is_dominus:false};

  // 3 is above both
  user1.lord = '3';
  user1.allies_above = ['3'];
  user1.team = [user2._id, '3'];

  user2.lord = '3';
  user2.allies_above = ['3'];
  user2.team = [user1._id, '3'];

  test.equal(dInit.getPlayersRelationship(user1, user2._id), 'enemy_ally');
})


Tinytest.add('init.getRelationType.vassal', function(test) {
  Players.remove({});

  var user1 = {_id:'1', allies_above:[], allies_below:[], team:[], vassals:[], castle_id:1, lord:null, king:null, is_dominus:false};
  var user2 = {_id:'2', allies_above:[], allies_below:[], team:[], vassals:[], castle_id:2, lord:null, king:null, is_dominus:false};

  user1.vassals = ['3'];
  user1.allies_below = [user2._id, '3'];
  user1.team = [user2._id, '3'];

  user2.lord = '3';
  user2.allies_above = ['3', user1._id];
  user2.team = [user1._id, '3'];

  test.equal(dInit.getPlayersRelationship(user1, user2._id), 'vassal');
});


Tinytest.add('init.getRelationType.direct_vassal', function(test) {
  Players.remove({});

  var user1 = {_id:'1', allies_above:[], allies_below:[], team:[], vassals:[], castle_id:1, lord:null, king:null, is_dominus:false};
  var user2 = {_id:'2', allies_above:[], allies_below:[], team:[], vassals:[], castle_id:2, lord:null, king:null, is_dominus:false};

  user1.vassals = [user2._id];
  user1.allies_below = [user2._id];
  user1.team = [user2._id];

  user2.lord = user1._id;
  user2.allies_above = [user1._id];
  user2.team = [user1._id];

  test.equal(dInit.getPlayersRelationship(user1, user2._id), 'direct_vassal');
});


Tinytest.add('init.getRelationType.king', function(test) {
  Players.remove({});

  var user1 = {_id:'1', allies_above:[], allies_below:[], team:[], vassals:[], castle_id:1, lord:null, king:null, is_dominus:false};
  var user2 = {_id:'2', allies_above:[], allies_below:[], team:[], vassals:[], castle_id:2, lord:null, king:null, is_dominus:false};

  // 3 is inbetween
  user1.lord = '3';
  user1.allies_above = [user2._id, '3'];
  user1.team = [user2._id, '3'];
  user1.king = user2._id;

  user2.vassals = ['3'];
  user2.allies_below = [user1._id, '3'];
  user2.team = [user2._id, '3'];

  test.equal(dInit.getPlayersRelationship(user1, user2._id), 'king');
});


Tinytest.add('init.getRelationType.mine', function(test) {
  Players.remove({});

  var user1 = {_id:'1', allies_above:[], allies_below:[], team:[], vassals:[], castle_id:1, lord:null, king:null, is_dominus:false};
  var user2 = {_id:'2', allies_above:[], allies_below:[], team:[], vassals:[], castle_id:2, lord:null, king:null, is_dominus:false};

  test.equal(dInit.getPlayersRelationship(user1, user1._id), 'mine');
});
