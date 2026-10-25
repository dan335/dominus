// general functions

dFunc = {
  isInt: function(value) {
    return !isNaN(value) && (function(x) { return (x | 0) === x; })(parseFloat(value))
  },

  // randomize order or array
  // http://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
  shuffleArray: function(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(dRandom.fraction() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
  },

  // Calls a method without waiting for it, from the client. A refusal is
  // logged the way Meteor.call with no callback logs it. Meteor.callAsync is
  // the call Meteor 3 keeps for methods whose server part is async.
  callAndForget: function(name /*, args */) {
    var args = Array.prototype.slice.call(arguments);
    return Meteor.callAsync.apply(Meteor, args).catch(function(error) {
      Meteor._debug("Error invoking Method '" + name + "'", error);
    });
  },

  // Meteor.apply(name, args, callback) through Meteor.callAsync. As with
  // Meteor.apply, an exception thrown by the callback is logged.
  callWithCallback: function(name, args, callback) {
    var deliver = function(error, result) {
      try {
        callback(error, result);
      } catch (e) {
        Meteor._debug("Exception in delivering result of invoking '" + name + "'", e);
      }
    };
    return Meteor.callAsync.apply(Meteor, [name].concat(args)).then(function(result) {
      deliver(undefined, result);
    }, function(error) {
      deliver(error);
    });
  }
}
