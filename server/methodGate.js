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
//
// A 'game' method waits for the gate's lookups before it runs. That would put
// all of its check() calls after audit-argument-checks has looked (on Meteor
// 3; 2.16 runs an async function in its caller's fiber), so the gate audits
// the method itself: see dGate.wrapAll.

var notAuthorized = function(reason) {
  return new Meteor.Error('not-authorized', reason);
};

var isCoreMethod = function(name) {
  return name.charAt(0) == '/' || _.contains(METHOD_POLICY_CORE, name);
};

dGate = {};

// the ids a 'game' method acts on: {gameId, targets}
dGate.gameSpec = function(policy, args) {
  return policy.game(args) || {};
};

// checks again what the gate checked (the ids in the spec and the game they
// resolved to), for the audit, which counts the gate's checks as the method's own
var checkAgain = function(spec, gameId) {
  if (spec.gameId !== undefined) {
    check(spec.gameId, String);
  }
  _.each(spec.targets || [], function(t) {
    check(t[1], String);
  });
  check(gameId, String);
};

// resolve and check the game a 'game' method acts on
// resolves with the gameId, rejects if a target is missing or in another game
dGate.resolveGame = async function(spec) {
  let gameId = spec.gameId;

  if (gameId !== undefined) {
    check(gameId, String);
  }

  for (let t of spec.targets || []) {
    let collection = t[0];
    let id = t[1];
    check(id, String);

    let doc = await collection.findOneAsync({_id:id}, {fields: {gameId:1}});
    if (!doc || !doc.gameId) {
      throw notAuthorized('Not found.');
    }

    if (gameId === undefined) {
      gameId = doc.gameId;
    } else if (doc.gameId !== gameId) {
      throw notAuthorized('That belongs to a different game.');
    }
  }

  if (typeof gameId !== 'string') {
    throw notAuthorized('No game.');
  }

  return gameId;
};

// Throws if the caller may not call the method at all. Returns the game spec
// of a 'game' method, whose caller must still be found in its game
// (dGate.requirePlayer), or null when there is nothing more to check.
dGate.enforce = function(name, invocation, args) {
  let policy = MethodPolicy[name];

  if (!policy) {
    console.error('methodGate: refused call to unclassified method "' + name + '". Add it to server/methodPolicy.js.');
    throw notAuthorized('Method not allowed.');
  }

  if (policy.access == 'public') {
    return null;
  }

  if (!invocation.userId) {
    throw notAuthorized('You must be logged in.');
  }

  if (policy.access == 'user') {
    return null;
  }

  if (policy.access == 'game') {
    return dGate.gameSpec(policy, args);
  }

  throw notAuthorized('Method not allowed.');
};

// rejects unless the caller is a player in the game the spec names;
// resolves with the gameId, once the game's settings are cached (_gs reads
// them without waiting; a game made on another server a moment ago may not
// be cached here yet)
dGate.requirePlayer = async function(invocation, spec) {
  let gameId = await dGate.resolveGame(spec);
  await dInit.requirePlayerInGame(invocation.userId, gameId);
  await _gs.ensureGame(gameId);
  return gameId;
};

// runs the method the way ddp-server runs a handler: audited when
// audit-argument-checks is loaded, with the gate's checks of the spec counted
var runAudited = function(original, invocation, args, name, spec, gameId) {
  let run = function() {
    checkAgain(spec, gameId);
    return original.apply(invocation, args);
  };
  if (Package['audit-argument-checks']) {
    return Match._failIfArgumentsAreNotAllChecked(run, invocation, args, "call to '" + name + "'");
  }
  return run();
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
      if (!this.connection) {
        return original.apply(this, arguments);
      }

      let invocation = this;
      let args = _.toArray(arguments);
      let spec = dGate.enforce(name, invocation, args);
      if (!spec) {
        return original.apply(invocation, args);
      }

      // the method is audited in runAudited, once the gate's lookups are done
      check(args, Match.Any);
      return (async function() {
        let gameId = await dGate.requirePlayer(invocation, spec);
        return await runAudited(original, invocation, args, name, spec, gameId);
      })();
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
