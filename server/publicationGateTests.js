// Tests for server/publicationGate.js (Oct 2026).
//
// A subscription that leaves out a publication's argument is refused before
// the publication runs, so it can't wedge the oplog driver and freeze method
// writes to the collection it queries.
//
// They run as part of runGameCreationTests (server/gameCreationTests.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  _publicationGateTests = async function(run, t) {
    var assert = t.assert;
    var equal = t.equal;

    // a stand-in for the subscription a publication runs in
    function fakeSub() {
      var stops = [];
      return {
        userId: null, connection: null, stops: stops,
        added: function() {}, changed: function() {}, removed: function() {},
        ready: function() {}, error: function() {}, onStop: function(fn) { stops.push(fn); }
      };
    }

    // runs a publication's handler as the server would, returns what it
    // returned or the error it threw
    function publish(name, args) {
      var sub = fakeSub();
      try {
        return {result: Meteor.server.publish_handlers[name].apply(sub, args)};
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

    // a real DDP subscription from a logged out client; returns {ready, error}
    async function subscribe(name, args) {
      var connection = DDP.connect(Meteor.absoluteUrl());
      try {
        var state = {ready: false, stopped: false, error: null};
        connection.subscribe.apply(connection, [name].concat(args).concat([{
          onReady: function() { state.ready = true; },
          onStop: function(error) { state.stopped = true; state.error = error || null; }
        }]));
        var end = Date.now() + 5000;
        while (!state.ready && !state.stopped && Date.now() < end) {
          await dTest.sleep(50);
        }
        return state;
      } finally {
        connection.disconnect();
      }
    }


    await run('publication gate: every publication that takes arguments is gated', function() {
      var names = _.keys(Meteor.server.publish_handlers);
      assert(names.length > 50, 'publications are registered (' + names.length + ')');
      _.each(Meteor.server.publish_handlers, function(handler, name) {
        if (handler.length > 0) {
          assert(handler.publicationGate, name + ' is gated');
        }
      });
    });

    await run('publication gate: a missing argument is refused with a 400 before the publication runs', function() {
      _.each(Meteor.server.publish_handlers, function(handler, name) {
        if (!handler.publicationGate) return;
        var res = publish(name, []);
        assert(res.error, name + ' with no arguments is refused');
        equal(res.error.error, 400, name + ': error');
        equal(res.error.reason, 'Missing argument', name + ': reason');
      });
      // one argument short
      var res = publish('myNormalChatrooms', ['gameId']);
      equal(res.error && res.error.error, 400, 'myNormalChatrooms with only gameId is refused');
    });

    await run('publication gate: with every argument, even null, the publication runs as before', function() {
      var cursor = publish('gameSignups', ['someGameId']).result;
      assert(cursor && cursor._getCollectionName() == 'gamesignups', 'gameSignups returns its cursor');
      equal(cursor._cursorDescription.selector.gameId, 'someGameId', 'with the id asked for');

      // the browser sends an undefined argument as null
      cursor = publish('gameSignups', [null]).result;
      assert(cursor && cursor._getCollectionName() == 'gamesignups', 'a null argument passes');

      var rankings = publish('income_rankings', ['someGameId', 1]).result;
      assert(rankings === undefined || !rankings.error, 'income_rankings runs');

      // extra arguments are passed through
      cursor = publish('gameSignups', ['someGameId', 'extra']).result;
      assert(cursor && cursor._getCollectionName() == 'gamesignups', 'extra arguments pass');

      // publications without arguments aren't touched
      cursor = publish('landingGames', []).result;
      assert(cursor && cursor._getCollectionName() == 'games', 'landingGames runs');
    });

    await run('publication gate: a subscription with no game id no longer freezes signup writes', async function() {
      var game = await t.createTestGame({name: 'Gate Test'});
      var user = await t.createTestUser({});
      try {
        await Gamesignups.insertAsync({gameId: game._id, userId: user._id, username: user.username, createdAt: new Date(), usedToken: false});
        var other = await Gamesignups.insertAsync({gameId: game._id, userId: Random.id(), username: 'other', createdAt: new Date(), usedToken: false});

        var refused = await subscribe('gameSignups', []);
        assert(refused.stopped && refused.error, 'the subscription is refused');
        equal(refused.error.error, 400, 'error');

        var ok = await subscribe('gameSignups', [game._id]);
        assert(ok.ready, 'with a game id it is ready');

        assert(await fencedWriteCommits(async function() { await Gamesignups.updateAsync(other, {$set: {usedToken: true}}); }, 5000),
          'a method-style write to Gamesignups still commits');
      } finally {
        await Gamesignups.removeAsync({gameId: game._id});
        await t.cleanup(game._id);
        await t.cleanupUser(user._id);
      }
    });
  };
}
