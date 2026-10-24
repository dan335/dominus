Queues.create('generateTree');

var fields = {playerId:1, x:1, y:1, castle_id:1, income:1, username:1}

var findVassals = async function(playerId) {
  check(playerId, String);
  var vassals = []
  for (const player of await Players.find({lord:playerId}, {fields:fields, sort:{username:1}}).fetchAsync()) {
      player.vassals = await findVassals(player._id)
      vassals.push(player)
  }
  return vassals
}

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.generateTree.process(4, async function(job) {
    await generateTree(job.data.gameId);
  });
}


generateTree = async function(gameId) {
  check(gameId, String);

  var tree = [];

  for (const king of await Players.find({lord:null, gameId:gameId}, {fields:fields, sort:{username:1}}).fetchAsync()) {
      king.vassals = await findVassals(king._id);
      tree.push(king);
  }

  await Games.updateAsync(gameId, {$set: {tree:tree}});
}
