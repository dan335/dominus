// Enforces server/methodPolicy.js on every method call that comes from a client.
//
// This is what guarantees that someone who is not a player in a game (a
// spectator, logged in or not) can't change anything in it: every 'game'
// method is refused unless the caller has a Players doc in the game that owns
// the documents being acted on. Methods missing from the policy are refused.
//
// Calls made by server code (jobs, startup) have no connection and are not
// checked. Methods called from inside a client method inherit its connection
// and user, so they are checked too.

var notAuthorized = function(reason) {
  return new Meteor.Error('not-authorized', reason);
};

var isCoreMethod = function(name) {
  return name.charAt(0) == '/' || _.contains(METHOD_POLICY_CORE, name);
};

// resolve and check the game a 'game' method acts on
// returns the gameId, throws if the caller is not a player in it
dGate = {};
dGate.resolveGame = function(policy, args) {
  let spec = policy.game(args) || {};
  let gameId = spec.gameId;

  if (gameId !== undefined) {
    check(gameId, String);
  }

  _.each(spec.targets || [], function(t) {
    let collection = t[0];
    let id = t[1];
    check(id, String);

    let doc = collection.findOne({_id:id}, {fields: {gameId:1}});
    if (!doc || !doc.gameId) {
      throw notAuthorized('Not found.');
    }

    if (gameId === undefined) {
      gameId = doc.gameId;
    } else if (doc.gameId !== gameId) {
      throw notAuthorized('That belongs to a different game.');
    }
  });

  if (typeof gameId !== 'string') {
    throw notAuthorized('No game.');
  }

  return gameId;
};

dGate.enforce = function(name, invocation, args) {
  let policy = MethodPolicy[name];

  if (!policy) {
    console.error('methodGate: refused call to unclassified method "' + name + '". Add it to server/methodPolicy.js.');
    throw notAuthorized('Method not allowed.');
  }

  if (policy.access == 'public') {
    return;
  }

  if (!invocation.userId) {
    throw notAuthorized('You must be logged in.');
  }

  if (policy.access == 'user') {
    return;
  }

  if (policy.access == 'game') {
    let gameId = dGate.resolveGame(policy, args);
    dInit.requirePlayerInGame(invocation.userId, gameId);
    return;
  }

  throw notAuthorized('Method not allowed.');
};

dGate.wrapAll = function() {
  let handlers = Meteor.server.method_handlers;
  let unclassified = [];

  _.each(_.keys(handlers), function(name) {
    let original = handlers[name];
    if (original._gated || isCoreMethod(name)) {
      return;
    }

    if (!MethodPolicy[name]) {
      unclassified.push(name);
    }

    let gated = function() {
      if (this.connection) {
        dGate.enforce(name, this, _.toArray(arguments));
      }
      return original.apply(this, arguments);
    };
    gated._gated = true;
    handlers[name] = gated;
  });

  if (unclassified.length) {
    console.error('methodGate: these methods are not in server/methodPolicy.js and will refuse every client call:', unclassified.join(', '));
  }
};

dGate.isCoreMethod = isCoreMethod;

Meteor.startup(function() {
  dGate.wrapAll();
});
