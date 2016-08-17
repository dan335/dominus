

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.expirePastMoves.process(Meteor.bindEnvironment(function(job) {
    dArmies.expirePastMoves();
    return Promise.resolve();
  }));
}


dArmies.expirePastMoves = function() {
  var cutoff = moment(new Date()).subtract(_s.armies.pastMovesMsLimit, 'ms').toDate();
  var find = {"pastMoves.moveDate": {$lt:cutoff}};
  var options = {fields:{pastMoves:1}};
  Armies.find(find, options).forEach(function(army) {
    var numPastMoves = army.pastMoves.length;
    var pastMoves = _.reject(army.pastMoves, function(pm) {
      return moment(new Date(pm.moveDate)).isBefore(moment(cutoff));
    });
    if (pastMoves.length != numPastMoves) {
      Armies.update(army._id, {$set:{pastMoves:pastMoves}});
    }
  })
}
