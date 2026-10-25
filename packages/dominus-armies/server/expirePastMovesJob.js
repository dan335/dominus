

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.expirePastMoves.process(async function(job) {
    await dArmies.expirePastMoves();
  });
}


dArmies.expirePastMoves = async function() {
  var cutoff = moment(dClock.now()).subtract(_s.armies.pastMovesMsLimit, 'ms').toDate();
  var find = {"pastMoves.moveDate": {$lt:cutoff}};
  var options = {fields:{pastMoves:1}};
  for (const army of await Armies.find(find, options).fetchAsync()) {
    var numPastMoves = army.pastMoves.length;
    var pastMoves = _.reject(army.pastMoves, function(pm) {
      return moment(new Date(pm.moveDate)).isBefore(moment(cutoff));
    });
    if (pastMoves.length != numPastMoves) {
      await Armies.updateAsync(army._id, {$set:{pastMoves:pastMoves}});
    }
  }
}
