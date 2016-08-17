Queues.create('generateTree');

var fields = {playerId:1, x:1, y:1, castle_id:1, income:1, username:1}

var findVassals = function(playerId) {
  check(playerId, String);
  var vassals = []
  Players.find({lord:playerId}, {fields:fields, sort:{username:1}}).forEach(function(player) {
      player.vassals = findVassals(player._id)
      vassals.push(player)
  })
  return vassals
}

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.generateTree.process(4, Meteor.bindEnvironment(function(job) {
    generateTree(job.data.gameId);
    return Promise.resolve();
  }));
}


generateTree = function(gameId) {
  check(gameId, String);

  var tree = [];

  Players.find({lord:null, gameId:gameId}, {fields:fields, sort:{username:1}}).forEach(function(king) {
      king.vassals = findVassals(king._id);
      tree.push(king);
  })

  Games.update(gameId, {$set: {tree:tree}});
}
