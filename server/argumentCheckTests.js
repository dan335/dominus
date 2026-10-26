// Tests for the argument checks on every method and publication (Oct 2026).
//
// Every argument a client sends is check()ed against the type the browser
// sends, and audit-argument-checks refuses any client call whose arguments
// weren't all checked. So a missing argument, or a Mongo operator like
// {$ne: null} in place of an id, is refused before it reaches a query.
//
// They run as part of runGameCreationTests (server/gameCreationTests.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  _argumentCheckTests = async function(run, t) {
    var assert = t.assert;
    var equal = t.equal;

    // how many arguments each method declares, so a new method has to be added
    // here (and get its checks) for these tests to pass
    var METHOD_PARAMS = {
      activateProToken: 1, addArmyPath: 4, addChatToRoom: 3, addMarker: 3, addMarkerCoords: 4,
      addMarkerGroup: 2, addMod: 1, addOrEditGame: 11, addPostView: 1, banUser: 2,
      buildVillage: 3, buy_resource: 3, cancelSignupForGame: 2, changeMainUsername: 1,
      change_username: 2, chatroomMakeAdmin: 3, chatroomMakeOwner: 3, chatroomRemoveAdmin: 3,
      clearUniqueIdsForJob: 1, coords_to_id: 4, createArmyFromBuilding: 4,
      daysSincePlayerActive: 1, decreasePathIndex: 1, deleteAvatar: 0, deleteEntireAccount: 0,
      deleteGameAccount: 1, destroyVillage: 1, disbandArmy: 2, edit_name: 4,
      fetchCountriesOnScreen: 1, fixMarkerGroupOrder: 0, forumDeleteTopic: 1, forumLockTopic: 1,
      forumMarkAllRead: 0, forumNewPost: 2, forumNewTopic: 3, forumPinTopic: 1,
      forumUnlockTopic: 1, forumUnpinTopic: 1, getGameInfo: 1, getResourcesGatheredAtHex: 3,
      hideAlertMine: 2, hide_allies: 1, hide_armies: 1, hide_castle: 1, hide_coords: 1,
      hide_lords: 1, hide_minimap: 1, hide_villages: 1, hide_welcome_screen: 1, hireArmy: 4,
      increasePathIndex: 1, inviteToChatroom: 3, joinGame: 2, kickFromChatroom: 3,
      leaveChatroom: 2, markAlertAsRead: 2, markAllAlertsAsRead: 1, moveMarkerGroupDown: 1,
      moveMarkerGroupUp: 1, onEmailVerified: 0, pauseJobQueue: 0, pauseMovement: 1,
      removeArmyPath: 1, removeGame: 1, removeMarker: 1, removeMarkerGroup: 1,
      renameChatroom: 3, rensendEmailVerification: 0, reportClientError: 1, reportPlayer: 2, resetQueueStats: 0,
      resumeJobQueue: 0, resumeMovement: 1, runAllTests: 1, runBullJob: 2, runGameCreationTests: 0,
      saveMarkerGroupInfo: 2, saveMarkerInfo: 3, sell_resource: 3, sendToMailingList: 1,
      send_gold_to: 3, setGender: 1, setHexScale: 2, setMarkerOrder: 5, set_unit_image: 4,
      showAlertMine: 2, show_allies: 1, show_armies: 1, show_castle: 1, show_coords: 1,
      show_lords: 1, show_minimap: 1, show_villages: 1, signupForGame: 3, splitArmy: 3,
      startChatroomWith: 2, stripeDonationCheckout: 2, stripeProCheckout: 2,
      stripePurchaseCheckout: 4, unbanUser: 1, upgradeVillage: 2, uploadAvatarToS3: 3,
      // the armies.* methods take one object
      'armies.combineArmies': 1, 'armies.joinBuilding': 1, 'armies.returnToCastle': 1,
      'armies.stopMoving': 1
    };

    // never called here, even with bad arguments: they talk to Stripe, S3 or
    // SendGrid if a check is ever moved below that code
    var EXTERNAL = ['stripeDonationCheckout', 'stripeProCheckout', 'stripePurchaseCheckout',
      'uploadAvatarToS3', 'sendToMailingList', 'deleteAvatar'];

    var operator = function() { return {$ne: null}; };

    function clientMethods() {
      return _.filter(_.keys(Meteor.server.method_handlers), function(name) {
        return !dGate.isCoreMethod(name) && name.indexOf('argumentCheckTests') !== 0;
      });
    }

    // runs a method's handler the way a call from the server would (so the
    // method gate is skipped and only the method's own checks can refuse it);
    // returns the error it threw (or its promise rejected with), or null
    async function callMethod(name, args, userId) {
      var invocation = {
        isSimulation: false, userId: userId, connection: null, randomSeed: null,
        setUserId: function() {}, unblock: function() {}
      };
      try {
        await DDP._CurrentMethodInvocation.withValue(invocation, async function() {
          await Meteor.server.method_handlers[name].apply(invocation, args);
        });
        return null;
      } catch (e) {
        return e;
      }
    }

    // a stand-in for the subscription a publication runs in
    function fakeSub(userId) {
      var stops = [];
      return {
        userId: userId || null, connection: null, stops: stops,
        added: function() {}, changed: function() {}, removed: function() {},
        ready: function() {}, error: function() {}, onStop: function(fn) { stops.push(fn); }
      };
    }

    // runs a publication's handler, returns {result} or {error}
    async function publish(name, args, userId) {
      var sub = fakeSub(userId);
      try {
        return {result: await Meteor.server.publish_handlers[name].apply(sub, args)};
      } catch (e) {
        return {error: e};
      } finally {
        sub.stops.forEach(function(fn) { fn(); });
      }
    }

    // a write made the way a method makes it, inside a write fence; true when
    // every observer has seen it within ms
    async function fencedWriteCommits(fn, ms) {
      var fence = new DDPServer._WriteFence();
      var committed = false;
      await DDPServer._CurrentWriteFence.withValue(fence, fn);
      fence.onAllCommitted(function() { committed = true; });
      fence.arm();
      var end = Date.now() + ms;
      while (!committed && Date.now() < end) {
        await dTest.sleep(50);
      }
      return committed;
    }

    // a method call over a DDP connection: a promise of its result
    function callOver(connection, name /* , args */) {
      var args = _.toArray(arguments).slice(2);
      return new Promise(function(resolve, reject) {
        connection.apply(name, args, {noRetry: true}, function(error, result) {
          if (error) reject(error);
          else resolve(result);
        });
      });
    }

    // a DDP connection to this server, logged in as userId when given
    async function connect(userId) {
      var connection = DDP.connect(Meteor.absoluteUrl());
      // a call made with noRetry before the connection is up never gets its
      // result, so wait for it first
      if (!await dTest.waitFor(function() { return connection.status().connected; }, 10000)) {
        connection.disconnect();
        throw new Error('FAIL: could not open a DDP connection to ' + Meteor.absoluteUrl());
      }
      if (userId) {
        var stamped = Accounts._generateStampedLoginToken();
        Accounts._insertLoginToken(userId, stamped);
        await callOver(connection, 'login', {resume: stamped.token});
      }
      return connection;
    }

    // a real subscription; returns {ready, stopped, error}
    async function subscribe(connection, name, args) {
      var state = {ready: false, stopped: false, error: null};
      var handle = connection.subscribe.apply(connection, [name].concat(args).concat([{
        onReady: function() { state.ready = true; },
        onStop: function(error) { state.stopped = true; state.error = error || null; }
      }]));
      var end = Date.now() + 5000;
      while (!state.ready && !state.stopped && Date.now() < end) {
        await dTest.sleep(50);
      }
      state.handle = handle;
      return state;
    }

    // check() throws a Match.Error; a client gets it as a 400 'Match failed'
    function describe(error) {
      return error ? (error.errorType || '') + ' ' + (error.error || '') + ' ' + (error.reason || error.message) : 'no error';
    }

    function isMatchFailed(error) {
      return !!error && (error.errorType == 'Match.Error' || (error.error == 400 && error.reason == 'Match failed'));
    }


    await run('argument checks: audit-argument-checks is on', async function() {
      assert(Package['audit-argument-checks'], 'the package is loaded');

      // a method that doesn't check its argument is refused, called the way a
      // browser calls it
      var ran = 0;
      Meteor.methods({argumentCheckTestsUnchecked: function(arg) { ran++; return arg; }});
      var connection = await connect(null);
      try {
        var error = null;
        try {
          await callOver(connection, 'argumentCheckTestsUnchecked', 'x');
        } catch (e) {
          error = e;
        }
        assert(error, 'the call is refused');
        equal(error && error.error, 500, 'as a server error');
        equal(ran, 1, 'after the method ran (audit-argument-checks checks afterwards)');
      } finally {
        connection.disconnect();
        delete Meteor.server.method_handlers.argumentCheckTestsUnchecked;
      }
    });

    // A 'game' method waits for server/methodGate.js to look up the caller's
    // player first. The audit still covers it as before: the gate's own checks
    // of the ids it looks up count, and an argument nobody checks is refused.
    // On 2.16 an async function runs in its caller's fiber, so an argument
    // checked only after the method's first await still counts; on Meteor 3
    // it won't (audit-argument-checks looks when the method returns its
    // promise), so this test changes then on purpose.
    await run('argument checks: a game method behind the method gate is audited as before, and keeps its user and write fence', async function() {
      var user = await t.createTestUser({});
      var gameId = 'argcheck_gate_' + Random.id(6);
      var playerId = await Players.insertAsync({gameId: gameId, userId: user._id, username: 'argcheck gate'});
      var castleId = await Castles.insertAsync({gameId: gameId, user_id: user._id, name: 'argcheck gate castle'});
      var otherGame = 'argcheck_gate_' + Random.id(6);
      var ran = {};
      var methods = {
        argumentCheckTestsGateUnchecked: [{gameId: 0}, function(gameId, other) { ran.unchecked = (ran.unchecked || 0) + 1; return 'ran'; }],
        argumentCheckTestsGateChecksRest: [{gameId: 0}, function(gameId, other) { check(other, String); return 'ran'; }],
        argumentCheckTestsGateTarget: [{target: 0}, function(id) { return 'ran'; }],
        argumentCheckTestsGateNotPlayer: [{gameId: 0}, function(gameId) { ran.notPlayer = (ran.notPlayer || 0) + 1; return 'ran'; }],
        argumentCheckTestsGateAsync: [{gameId: 0}, async function(gameId, other) {
          check(other, String);
          await Promise.resolve();
          return [this.userId, Meteor.userId(), !!DDPServer._CurrentWriteFence.get(), DDP._CurrentMethodInvocation.get() === this];
        }],
        argumentCheckTestsGateLateCheck: [{gameId: 0}, async function(gameId, other) {
          await Promise.resolve();
          check(other, String);
          ran.late = (ran.late || 0) + 1;
          return 'ran';
        }]
      };
      _.each(methods, function(m, name) {
        var spec = m[0];
        MethodPolicy[name] = {access: 'game', game: function(args) {
          return spec.target === undefined ? {gameId: args[spec.gameId]} : {targets: [[Castles, args[spec.target]]]};
        }};
        Meteor.methods(_.object([[name, m[1]]]));
      });
      dGate.wrapAll();
      var connection = await connect(user._id);
      var call = async function() {
        try {
          return {result: await callOver.apply(null, [connection].concat(_.toArray(arguments)))};
        } catch (e) {
          return {error: e};
        }
      };
      try {
        var out = await call('argumentCheckTestsGateUnchecked', gameId, 'x');
        equal(out.error && out.error.error, 500, 'an argument nobody checked: refused as a server error');
        equal(ran.unchecked, 1, 'after the method ran');

        equal((await call('argumentCheckTestsGateChecksRest', gameId, 'x')).result, 'ran', 'the gate\'s check of the gameId counts');
        equal((await call('argumentCheckTestsGateTarget', castleId)).result, 'ran', 'the gate\'s check of a target\'s id counts');

        out = await call('argumentCheckTestsGateNotPlayer', otherGame);
        equal(out.error && out.error.error, 'not-authorized', 'not a player in the game: refused');
        equal(ran.notPlayer, undefined, 'before the method ran');

        out = await call('argumentCheckTestsGateAsync', gameId, 'x');
        equal(JSON.stringify(out.result), JSON.stringify([user._id, user._id, true, true]), 'an async method keeps its user, write fence and invocation after an await');

        out = await call('argumentCheckTestsGateLateCheck', gameId, 'x');
        equal(out.result, 'ran', 'on 2.16, an argument checked only after an await still counts');
        equal(ran.late, 1, 'and the method ran once');

        out = await call('argumentCheckTestsGateChecksRest', gameId, {$ne: null});
        equal(out.error && out.error.error, 400, 'a bad argument is still refused by the method\'s own check');
        out = await call('argumentCheckTestsGateChecksRest', {$ne: null}, 'x');
        equal(out.error && out.error.error, 400, 'and a bad gameId by the gate\'s');
      } finally {
        connection.disconnect();
        _.each(methods, function(m, name) {
          delete Meteor.server.method_handlers[name];
          delete MethodPolicy[name];
        });
        await Players.removeAsync(playerId);
        await Castles.removeAsync(castleId);
        await t.cleanupUser(user._id);
      }
    });

    await run('argument checks: every method is listed with its argument count', function() {
      var names = clientMethods();
      assert(names.length > 90, 'methods are registered (' + names.length + ')');
      var missing = _.difference(names, _.keys(METHOD_PARAMS));
      var gone = _.difference(_.keys(METHOD_PARAMS), names);
      equal(missing.join(', '), '', 'methods missing from METHOD_PARAMS');
      equal(gone.join(', '), '', 'methods in METHOD_PARAMS that no longer exist');
    });

    await run('argument checks: a method called with none of its arguments is refused before it does anything', async function() {
      var user = await t.createTestUser({});
      try {
        await dTest.eachAsync(METHOD_PARAMS, async function(count, name) {
          if (count === 0 || _.contains(EXTERNAL, name)) return;
          // its one argument, a suite filter, is optional: called with none it
          // would start a second run, which it refuses
          if (name == 'runAllTests') return;
          var error = await callMethod(name, [], user._id);
          assert(error, name + ' with no arguments is refused');
          assert(isMatchFailed(error), name + ': refused by check(), got ' + describe(error));
        });
      } finally {
        await t.cleanupUser(user._id);
      }
    });

    await run('argument checks: a method called with Mongo operators for arguments is refused', async function() {
      var user = await t.createTestUser({});
      try {
        await dTest.eachAsync(METHOD_PARAMS, async function(count, name) {
          if (count === 0 || _.contains(EXTERNAL, name)) return;
          var args = _.times(count, operator);
          var error = await callMethod(name, args, user._id);
          assert(error, name + ' with {$ne: null} arguments is refused');
          assert(isMatchFailed(error), name + ': refused by check(), got ' + describe(error));
        });
      } finally {
        await t.cleanupUser(user._id);
      }
    });

    await run('argument checks: a publication given Mongo operators for arguments is refused', async function() {
      var user = await t.createTestUser({});
      try {
        var gated = 0;
        await dTest.eachAsync(Meteor.server.publish_handlers, async function(handler, name) {
          if (!handler.publicationGate) return;
          gated++;
          // as many as it takes: the gate refuses fewer than it declares
          var args = _.times(8, operator);
          var res = await publish(name, args, user._id);
          assert(isMatchFailed(res.error), name + ' with {$ne: null} arguments is refused, got ' +
            describe(res.error));
        });
        assert(gated > 70, 'publications with arguments were tried (' + gated + ')');
      } finally {
        await t.cleanupUser(user._id);
      }
    });

    await run('argument checks: null still works where the browser sends it', async function() {
      var user = await t.createTestUser({});
      try {
        // spectators have no playerId, the browser sends null
        var res = await publish('myAlerts', [null, 10, null], user._id);
        assert(!res.error, 'myAlerts with a null playerId runs');
        res = await publish('gameSignups', [null], user._id);
        assert(!res.error, 'gameSignups with a null gameId runs');
        res = await publish('recentchats', [null], user._id);
        assert(!res.error, 'recentchats with no rooms runs');
        // the method keeps its own "not found" handling
        var error = await callMethod('daysSincePlayerActive', [null], user._id);
        assert(!error, 'daysSincePlayerActive(null) runs');
      } finally {
        await t.cleanupUser(user._id);
      }
    });

    await run('argument checks: {$ne: null} can no longer read every private chat', async function() {
      var game = await t.createTestGame({name: 'Arg Check Test'});
      var user = await t.createTestUser({});
      var roomA = Random.id(), roomB = Random.id();
      try {
        await Roomchats.insertAsync({room_id: roomA, gameId: game._id, text: 'a', created_at: new Date()});
        await Roomchats.insertAsync({room_id: roomB, gameId: game._id, text: 'b', created_at: new Date()});

        // what the publication's query matches when handed {$ne: null}
        var leaked = await Roomchats.find({room_id: {$ne: null}}).mapAsync(function(c) { return c.room_id; });
        assert(_.contains(leaked, roomA) && _.contains(leaked, roomB), 'the bare query matches chats from every room');

        var res = await publish('roomchats', [{$ne: null}], user._id);
        assert(isMatchFailed(res.error), 'roomchats refuses it');
        res = await publish('myNormalChatrooms', [game._id, {$ne: null}], user._id);
        assert(isMatchFailed(res.error), 'myNormalChatrooms refuses it');

        var cursor = (await publish('roomchats', [roomA], user._id)).result;
        assert(cursor, 'a room id still works');
        equal((await cursor.fetchAsync()).length, 1, 'and gets that room\'s chat');
      } finally {
        await Roomchats.removeAsync({room_id: {$in: [roomA, roomB]}});
        await t.cleanup(game._id);
        await t.cleanupUser(user._id);
      }
    });

    await run('argument checks: refused subscriptions and calls over DDP leave writes working', async function() {
      var game = await t.createTestGame({name: 'Arg Check DDP Test'});
      var user = await t.createTestUser({});
      var connection = await connect(user._id);
      try {
        var player = await Players.insertAsync({gameId: game._id, userId: Random.id(), username: 'argcheck', income: 1});

        var refused = await subscribe(connection, 'userProfile', []);
        assert(refused.stopped, 'userProfile with no argument is refused');
        equal(refused.error && refused.error.error, 400, 'with a 400');

        refused = await subscribe(connection, 'income_rankings', [{$ne: null}, 1]);
        assert(refused.stopped, 'income_rankings with an operator is refused');
        equal(refused.error && refused.error.error, 400, 'with a 400');

        var error = null;
        try {
          await callOver(connection, 'hide_welcome_screen', {$ne: null});
        } catch (e) {
          error = e;
        }
        assert(error, 'a method call with an operator is refused');

        var ok = await subscribe(connection, 'income_rankings', [game._id, 1]);
        assert(ok.ready, 'income_rankings with a game id is ready');

        assert(await fencedWriteCommits(async function() { await Players.updateAsync(player, {$set: {income: 2}}); }, 5000),
          'a method-style write to Players still commits');
      } finally {
        connection.disconnect();
        await t.cleanup(game._id);
        await t.cleanupUser(user._id);
      }
    });
  };
}
