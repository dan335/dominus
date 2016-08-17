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


// Tinytest.add('armies.expirePastMoves', function(test) {
//   let gameId = stubTestGame();
//   Armies.remove({});
//   Players.remove({});
//
//   var player = {username:'bewb', x:0, y:0, team:[], lord:null, king:null, vassals:[], allies_above:[], allies_below:[], castle_id:1, is_dominus:false};
//   player._id = Players.insert(player);
//   var soldiers = {'footmen':1};
//   var army = dArmies.create(player._id, soldiers, 0, 0);
//
//   var pastMoves = [
//     {x:1, y:0, moveDate:moment().subtract(100000, 'ms').toDate()},
//     {x:2, y:0, moveDate:moment().subtract(200000, 'ms').toDate()},
//     {x:3, y:0, moveDate:moment().subtract(300000, 'ms').toDate()},
//   ]
//   Armies.update(army._id, {$set:{pastMoves:pastMoves}});
//   test.equal(Armies.findOne(army._id).pastMoves.length, 3);
//
//   // should not expire any
//   _s.armies.pastMovesMsLimit = 1000000;
//   dArmies.expirePastMoves();
//   test.equal(Armies.findOne(army._id).pastMoves.length, 3, 'expire none');
//
//   // should expire 1
//   _s.armies.pastMovesMsLimit = 250000;
//   dArmies.expirePastMoves();
//   test.equal(Armies.findOne(army._id).pastMoves.length, 2, 'expire one');
//
//   // should expire all
//   _s.armies.pastMovesMsLimit = 10000;
//   dArmies.expirePastMoves();
//   test.equal(Armies.findOne(army._id).pastMoves.length, 0, 'expire all');
// });
