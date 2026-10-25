// keep track of how may villages are in each game
// store in Games.numVillages
// needed for rankings


var numVillages = {};


Meteor.startup(function() {
	if (process.env.DOMINUS_WORKER == 'true') {

    let query = Villages.find({}, {fields: {gameId:1}});
    query.observeAsync({

      added: function(doc) {
        if (_.has(numVillages, doc.gameId)) {
          numVillages[doc.gameId]++;
        } else {
          numVillages[doc.gameId] = 1;
        }
        updateCount();
      },

      removed: function(doc) {
        if (_.has(numVillages, doc.gameId)) {
          numVillages[doc.gameId]--;
          updateCount();
        } else {
          console.error('tried to remove non-existant gameId from numVillages');
        }
      }
    }).catch(function(error) {
      console.error('could not watch villages for numVillages', error);
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

  let gameIds = _.keys(numVillages);
  gameIds.forEach(function(gameId) {
    bulk.find({_id:gameId, hasClosed:false}).updateOne({$set: {numVillages:numVillages[gameId]}});
    hasBulkOp = true;
  })

  if (hasBulkOp) {
		await bulk.execute();
	}
};
