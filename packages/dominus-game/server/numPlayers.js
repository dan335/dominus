// keep track of how may players are in each game
// store in Games.numPlayers


var numPlayers = {};


Meteor.startup(function() {
	if (process.env.DOMINUS_WORKER == 'true') {

    let query = Players.find({}, {fields: {gameId:1}});
    query.observeAsync({

      added: function(doc) {
        if (_.has(numPlayers, doc.gameId)) {
          numPlayers[doc.gameId]++;
        } else {
          numPlayers[doc.gameId] = 1;
        }
        updateCount();
      },

      removed: function(doc) {
        if (_.has(numPlayers, doc.gameId)) {
          numPlayers[doc.gameId]--;
          updateCount();
        } else {
          console.error('tried to remove non-existant gameId from numPlayers');
        }
      }
    }).catch(function(error) {
      console.error('could not watch players for numPlayers', error);
    });

  }
});



var updateCount = _.debounce(function() {
  writeCount().catch(function(error) {
    console.error(error);
  });
}, 1000);


var writeCount = async function() {
  var bulk = Games.rawCollection().initializeUnorderedBulkOp();
	var hasBulkOp = false;

  let gameIds = _.keys(numPlayers);
  gameIds.forEach(function(gameId) {
    bulk.find({_id:gameId, hasClosed:false}).updateOne({$set: {numPlayers:numPlayers[gameId]}});
    hasBulkOp = true;
  })

  if (hasBulkOp) {
		await bulk.execute();
	}
};
