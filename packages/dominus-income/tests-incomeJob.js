// // run at the beginning of tests
// stubTestGame = function() {
//   Games.remove({});
//   let game = {
//     _id: 'testgame',
//     isSpeed: false,
//     hasEnded: false,
//     maxPlayers: 200
//   }
//   game._id = Games.insert(game);
//   return game._id;
// }
//
//
//
Tinytest.add('income.addIncome', function(test) {
  Players.remove({});
  var playerId = Players.insert({});

  var job = new dIncome.incomeJob();
  job.addIncome(playerId, {gold:30, lumber:20});

  test.equal(job.data[0].income.gold, 30);
  test.equal(job.data[0].income.lumber, 20);

  job.addIncome(playerId, {gold:30, lumber:20});

  test.equal(job.data[0].income.gold, 60);
  test.equal(job.data[0].income.lumber, 40);

  test.equal(job.data[0].incomeVassal.lumber, 0);
  job.addIncome(playerId, {gold:30, lumber:20}, true);
  test.equal(job.data[0].incomeVassal.lumber, 20);

  job.addIncome(playerId, {gold:30, lumber:20}, false, true);
  test.equal(job.data[0].incomeCapital.lumber, 20);
});
