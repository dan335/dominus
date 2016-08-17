// keep track of how may countries are in each game
// store in Games.numCountries


var numCountries = {};


Meteor.startup(function() {
	if (process.env.DOMINUS_WORKER == 'true') {

    let query = Countries.find({}, {fields: {gameId:1}});
    query.observe({

      added: function(doc) {
        if (_.has(numCountries, doc.gameId)) {
          numCountries[doc.gameId]++;
        } else {
          numCountries[doc.gameId] = 1;
        }
        updateCount();
      },

      removed: function(doc) {
        if (_.has(numCountries, doc.gameId)) {
          numCountries[doc.gameId]--;
          updateCount();
        } else {
          console.error('tried to remove non-existant gameId from numCountries');
        }
      }
    });

  }
});



var updateCount = _.debounce(function() {
  var bulk = Games.rawCollection().initializeOrderedBulkOp();
	var hasBulkOp = false;

  let gameIds = _.keys(numCountries);
  gameIds.forEach(function(gameId) {
    bulk.find({_id:gameId, hasClosed:false}).updateOne({$set: {numCountries:numCountries[gameId]}});
    hasBulkOp = true;
  })

  if (hasBulkOp) {
		bulk.execute({}, function(error, result) {
	    if (error) {
	      console.error(error);
	    }
	  });
	}
}, 1000);
