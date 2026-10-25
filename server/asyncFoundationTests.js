// Tests for the foundations of the async conversion (PR 6 of the Meteor
// upgrade plan, stage 2): the settings cache that keeps _gs synchronous, the
// async twins of dMarket.total_of_buy and total_of_sell, and how Meteor 2.16
// runs async code, which the conversion PRs rely on. The missing-await checker
// has its own tests (tests/async/check-await.test.js).
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  // created on first use and kept for the life of the process (Bull allows one
  // handler per queue)
  var readyQueue = null;
  var readyQueueRuns = [];

  Meteor.startup(function() {
    dTest.addSuite('async foundations (server/asyncFoundationTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var isWorker = process.env.DOMINUS_WORKER == 'true';
      var cache = _gs._cachedGames;

      // the console.error lines logged while fn runs
      function captureErrors(fn) {
        var logged = [];
        var error = console.error;
        console.error = function() { logged.push(_.toArray(arguments).join(' ')); };
        try {
          dTest.settle(fn());
        } finally {
          console.error = error;
        }
        return logged;
      }

      function game(overrides) {
        return t.createTestGame(_.extend({name: 'Async foundations ' + Random.id(4), isStarting: true}, overrides || {}));
      }


      // --- The settings cache ---

      run('settings cache: every game is cached, whether it has started, ended or closed', function() {
        var games = [
          game({hasStarted: false}),
          game({hasStarted: true, hasEnded: false}),
          game({hasStarted: true, hasEnded: true}),
          game({hasStarted: true, hasEnded: true, hasClosed: true, isSpeed: true})
        ];
        try {
          assert(dTest.waitFor(function() { return games.every(function(g) { return !!cache[g._id]; }); }), 'all four cached');
          equal(cache[games[3]._id].isSpeed, true, 'with their settings');
          var allowed = ['_id'].concat(_.keys(_gs._settingsFields));
          equal(_.difference(_.keys(cache[games[3]._id]), allowed).join(','), '', 'nothing but the settings');
          equal(cache[games[3]._id].maxPlayers, 200, 'every setting the game has');
        } finally {
          games.forEach(function(g) { t.cleanup(g._id); });
        }
      });

      run('settings cache: _gs.ready has filled it with every game in the database', function() {
        equal(dTest.isPromise(_gs.ready), true, '_gs.ready is a promise');
        dTest.settle(_gs.ready);
        var missing = Games.find({}, {fields: {_id: 1}}).fetch().filter(function(g) { return !cache[g._id]; });
        equal(missing.length, 0, 'games missing from the cache: ' + _.pluck(missing, '_id').join(','));
      });

      run('settings cache: _gs._fill reads every game into an empty cache, as at startup', function() {
        var g = game({isRelaxed: true});
        var saved = _.clone(cache);
        try {
          assert(dTest.waitFor(function() { return !!cache[g._id]; }), 'cached');
          _.keys(cache).forEach(function(id) { delete cache[id]; });
          dTest.settle(_gs._fill());
          equal(_.keys(cache).length, Games.find().count(), 'every game');
          equal(cache[g._id].isRelaxed, true, 'with its settings');
        } finally {
          _.extend(cache, saved);
          t.cleanup(g._id);
        }
      });

      run('settings cache: ensureGame reads a game that is not cached; a gameId that is not a game is left out', async function() {
        var g = game({isCrazyFast: true});
        try {
          assert(dTest.waitFor(function() { return !!cache[g._id]; }), 'cached by the observer');
          delete cache[g._id];
          await _gs.ensureGame(g._id);
          equal(cache[g._id] && cache[g._id].isCrazyFast, true, 'read back in by ensureGame');
          await _gs.ensureGame('noSuchGame_' + Random.id());
          equal(_.keys(cache).filter(function(id) { return id.indexOf('noSuchGame_') === 0; }).length, 0, 'not a game: not cached');
          await _gs.ensureGame(undefined);
          await _gs.ensureGame(null);
        } finally {
          t.cleanup(g._id);
        }
      });

      run('settings cache: a miss logs where it came from, once per game, and still reads the game', function() {
        var g = game({isSpeed: true});
        try {
          assert(dTest.waitFor(function() { return !!cache[g._id]; }), 'cached');
          delete cache[g._id];
          delete _gs._missesLogged[g._id];
          var value;
          var logged = captureErrors(function() { value = _gs.getGame(g._id); });
          equal(value.isSpeed, true, 'the settings, read from the database');
          equal(logged.length, 1, 'one line logged');
          assert(logged[0].indexOf(g._id) >= 0 && logged[0].indexOf('settings cache miss') >= 0 &&
            logged[0].indexOf('asyncFoundationTests') >= 0, 'with the gameId and a stack that names the caller: ' + logged[0]);
          equal(cache[g._id] && cache[g._id].isSpeed, true, 'and the game is cached again');

          var missing = 'noSuchGame_' + Random.id();
          var reads = [];
          logged = captureErrors(function() { reads = [_gs.getGame(missing), _gs.getGame(missing)]; });
          equal(JSON.stringify(reads), '[{},{}]', 'a gameId that is not a game reads as {}');
          equal(logged.length, 1, 'logged once, not on every read');
          equal(JSON.stringify(_gs.getGame(undefined)), '{}', 'no gameId: {}');
        } finally {
          t.cleanup(g._id);
        }
      });

      // the observer would cache a new game a moment later anyway, so these
      // check that the code caches it itself, before it returns
      function cachedWhile(fn) {
        var cached = [];
        var cacheGame = _gs.cacheGame;
        _gs.cacheGame = function(doc) { cached.push(_.clone(doc)); return cacheGame(doc); };
        try {
          fn();
        } finally {
          _gs.cacheGame = cacheGame;
        }
        return cached;
      }

      run('settings cache: dManager.createNextGame caches the game it makes', function() {
        Games.remove({});
        var gameId = null;
        var cached = cachedWhile(function() { gameId = dManager.createNextGame(); });
        try {
          assert(gameId, 'a game was made');
          equal(cached.length, 1, 'one game cached');
          equal(cached[0]._id, gameId, 'the new one');
          equal(cache[gameId] && cache[gameId].maxPlayers, 50, 'with its settings');
        } finally {
          if (gameId) t.cleanup(gameId);
        }
      });

      run('settings cache: addOrEditGame caches the game it makes', function() {
        var admin = t.createTestUser({username: 'async_admin_' + Random.id(4)});
        Meteor.users.update(admin._id, {$set: {admin: true}});
        var invocation = {userId: admin._id, isSimulation: false, connection: null, unblock: function() {}, setUserId: function() {}};
        var gameId = null;
        var cached = cachedWhile(function() {
          gameId = dTest.settle(Meteor.server.method_handlers.addOrEditGame.apply(invocation,
            ['Async Cache Game', '', 20, '2030-01-02 03:04', false, true, false, false, false, false]));
        });
        try {
          assert(gameId, 'a game was made');
          equal(cached.length, 1, 'one game cached');
          equal(cached[0]._id, gameId, 'the new one');
          equal(cache[gameId] && cache[gameId].isSpeed, true, 'with its settings');
        } finally {
          if (gameId) t.cleanup(gameId);
          t.cleanupUser(admin._id);
        }
      });

      run('settings cache: no job is taken before the cache is full, and a job\'s game is cached before it runs', function() {
        if (!isWorker) return 'skip';
        var g = game({isNoLargeResources: true});
        var ready = _gs.ready;
        var release;
        try {
          assert(dTest.waitFor(function() { return !!cache[g._id]; }), 'cached');
          if (!readyQueue) {
            _gs.ready = new Promise(function(resolve) { release = resolve; });
            Queues.create('asyncFoundationReadyQueue');
            readyQueue = Queues.asyncFoundationReadyQueue;
            readyQueue.process(Meteor.bindEnvironment(function(job) {
              readyQueueRuns.push({gameId: job.data.gameId, cached: !!cache[job.data.gameId]});
              return Promise.resolve();
            }));
            dTest.settle(readyQueue.add({gameId: g._id}));
            dTest.sleep(1500);
            equal(readyQueueRuns.length, 0, 'no job before _gs.ready');
            release();
            assert(dTest.waitFor(function() { return readyQueueRuns.length === 1; }, 10000), 'the job ran once _gs.ready resolved');
          }
          readyQueueRuns.length = 0;
          delete cache[g._id];
          dTest.settle(readyQueue.add({gameId: g._id}));
          assert(dTest.waitFor(function() { return readyQueueRuns.length === 1; }, 10000), 'the job ran');
          equal(readyQueueRuns[0].cached, true, 'its game was in the cache when it started');
        } finally {
          if (release) release();
          _gs.ready = ready;
          t.cleanup(g._id);
        }
      });


      // --- dMarket async twins ---

      run('dMarket: total_of_buyAsync and total_of_sellAsync give what total_of_buy and total_of_sell give', async function() {
        var w = dTest.buildGameWorld({players: 1});
        try {
          var types = _.pluck(Market.find({gameId: w.gameId}).fetch(), 'type');
          assert(types.length >= 4, 'a market (' + types.join(',') + ')');
          for (var type of types) {
            for (var quantity of [0, 1, 7, 250, 0.5]) {
              equal(await dMarket.total_of_buyAsync(w.gameId, type, quantity), dMarket.total_of_buy(w.gameId, type, quantity), 'buy ' + quantity + ' ' + type);
              equal(await dMarket.total_of_sellAsync(w.gameId, type, quantity), dMarket.total_of_sell(w.gameId, type, quantity), 'sell ' + quantity + ' ' + type);
            }
          }
          equal(await dMarket.total_of_buyAsync(w.gameId, 'noSuchResource', 5), false, 'buy: no such resource');
          equal(await dMarket.total_of_sellAsync('noSuchGame', 'ore', 5), false, 'sell: no such game');
        } finally {
          w.cleanup();
        }
      });

      // upgrade PR 10
      run('dMarket: resourcesToGoldAsync gives what resourcesToGold gives, and refuses what it refuses', async function() {
        var w = dTest.buildGameWorld({players: 1});
        try {
          var cases = [{}, {gold: 12.5}, {grain: 1}, {grain: 3, lumber: 0.25, ore: 7, wool: 1, clay: 2, glass: 9, gold: 4},
            {grain: 1e6, gold: 0}, {wool: 0, clay: 0}, {grain: 5, notAResource: 99}];
          _s.market.types.forEach(function(type) { var r = {}; r[type] = 3.3; cases.push(r); });
          for (var resources of cases) {
            equal(await dMarket.resourcesToGoldAsync(w.gameId, resources), dMarket.resourcesToGold(w.gameId, resources), JSON.stringify(resources));
          }
          equal(await dMarket.resourcesToGoldAsync('noSuchGame', {grain: 5, gold: 2}), 2, 'no such game: only the gold');
          var refused = 0;
          for (var bad of [[w.gameId, {grain: -1}], [w.gameId, {ore: 'x'}], [w.gameId, {wool: NaN}], [1, {grain: 1}]]) {
            var syncError = null, asyncError = null;
            try { dMarket.resourcesToGold.apply(null, bad); } catch (e) { syncError = e; }
            try { await dMarket.resourcesToGoldAsync.apply(null, bad); } catch (e) { asyncError = e; }
            equal(!!asyncError, !!syncError, JSON.stringify(bad) + ' refused by both or neither');
            if (syncError) {
              refused++;
              equal(asyncError.message, syncError.message, JSON.stringify(bad) + ' with the same error');
            } else {
              equal(await dMarket.resourcesToGoldAsync.apply(null, bad), dMarket.resourcesToGold.apply(null, bad), JSON.stringify(bad) + ' gives the same');
            }
          }
          assert(refused >= 1, 'some are refused (' + refused + ')');
        } finally {
          w.cleanup();
        }
      });

      run('dMarket: the async twins accept and refuse the same arguments, with the same errors', async function() {
        var w = dTest.buildGameWorld({players: 1});
        try {
          var cases = [[w.gameId, 'ore', -1], [w.gameId, 'ore', 'x'], [w.gameId, 1, 5], [1, 'ore', 5],
            [w.gameId, 'ore', NaN], [w.gameId, 'ore', Infinity], [w.gameId, 'ore', null], [w.gameId, 'ore']];
          var refused = 0;
          for (var args of cases) {
            for (var name of ['total_of_buy', 'total_of_sell']) {
              var label = name + JSON.stringify(args);
              var syncValue, syncError = null, asyncValue, asyncError = null;
              try { syncValue = dMarket[name].apply(null, args); } catch (e) { syncError = e; }
              try { asyncValue = await dMarket[name + 'Async'].apply(null, args); } catch (e) { asyncError = e; }
              equal(!!asyncError, !!syncError, label + ' refused by both or neither');
              if (syncError) {
                refused++;
                equal(asyncError.message, syncError.message, label + ' same error');
              } else {
                equal(asyncValue, syncValue, label + ' same value');
              }
            }
          }
          assert(refused >= 8, 'most of these are refused (' + refused + ')');
        } finally {
          w.cleanup();
        }
      });


      // --- How Meteor 2.16 runs async code ---

      run('async code on 2.16: after an await, sync Meteor calls still work (so entry points can become async first)', async function() {
        var g = game();
        try {
          await new Promise(function(resolve) { setTimeout(resolve, 10); });
          equal(Games.findOne(g._id).name, g.name, 'a sync findOne after an await');
          Games.update(g._id, {$set: {desc: 'after await'}});
          await Promise.resolve();
          equal(Games.findOne(g._id).desc, 'after await', 'a sync update after an await');
          dTest.sleep(1);
          equal((await Games.findOneAsync(g._id)).desc, 'after await', 'and the async API');
        } finally {
          t.cleanup(g._id);
        }
      });

      // A missing await shows on 2.16 too: the caller goes on before the
      // work is done, as on Meteor 3. So the suites can catch one, and
      // check-await (tests/async) finds them before they run.
      run('async code: an async function that is not awaited is still running when the caller goes on, and an array\'s forEach does not wait for async callbacks', function() {
        var done = false;
        var work = async function() {
          await new Promise(function(resolve) { setTimeout(resolve, 50); });
          done = true;
        };
        var promise = work();
        equal(done, false, 'not finished when the caller goes on');
        dTest.settle(promise);
        equal(done, true, 'finished once awaited');

        var callbacks = 0;
        // check-await: ignore this test shows what the checker guards against
        [1, 2].forEach(async function() {
          await new Promise(function(resolve) { setTimeout(resolve, 20); });
          callbacks++;
        });
        equal(callbacks, 0, 'forEach went on before its callbacks finished');
        dTest.sleep(200);
        equal(callbacks, 2, 'they finish later');
      });

      // Meteor 2.16's cursor forEach and map wait for a callback's promise
      // (Meteor.wrapFn), and so do forEachAsync and mapAsync, which call
      // them; Meteor 3's forEachAsync awaits each callback.
      run('async code: a cursor\'s forEachAsync waits for an async callback', async function() {
        var games = [game(), game()];
        try {
          var finished = 0;
          await Games.find({_id: {$in: _.pluck(games, '_id')}}).forEachAsync(async function() {
            await new Promise(function(resolve) { setTimeout(resolve, 50); });
            finished++;
          });
          equal(finished, 2, 'both callbacks finished first');
          var fetched = 0;
          for (var doc of await Games.find({_id: {$in: _.pluck(games, '_id')}}).fetchAsync()) {
            await new Promise(function(resolve) { setTimeout(resolve, 10); });
            fetched += doc ? 1 : 0;
          }
          equal(fetched, 2, 'and so does a for...of over fetchAsync');
        } finally {
          games.forEach(function(g) { t.cleanup(g._id); });
        }
      });

      // --- adding jobs from async code (since upgrade PR 8) ---

      // upgrade PR 10: the income jobs' bulk writes
      run('income: dIncome.executeBulk writes a bulk op, and logs a failed one instead of throwing, as its callbacks did', function() {
        var ids = ['execBulk_' + Random.id(6), 'execBulk_' + Random.id(6)];
        try {
          var bulk = Markethistory.rawCollection().initializeOrderedBulkOp();
          bulk.insert({_id: ids[0], quantity: 1});
          var logged = captureErrors(function() { return dIncome.executeBulk(bulk); });
          equal(logged.length, 0, 'nothing logged');
          equal(Markethistory.find({_id: ids[0]}).count(), 1, 'written');

          // the second insert has the same _id, so the ordered bulk stops there
          var failing = Markethistory.rawCollection().initializeOrderedBulkOp();
          failing.insert({_id: ids[1], quantity: 1});
          failing.insert({_id: ids[1], quantity: 2});
          failing.insert({_id: ids[0] + 'x', quantity: 3});
          var result = 'not settled';
          logged = captureErrors(function() { return dIncome.executeBulk(failing).then(function(r) { result = r; }); });
          equal(result, undefined, 'resolves');
          equal(logged.length, 1, 'the error is logged');
          assert(/E11000|duplicate key/.test(logged[0]), 'the duplicate key: ' + logged[0]);
          equal(Markethistory.find({_id: ids[1]}).fetch().map(function(d) { return d.quantity; }).join(), '1', 'the writes before it are kept');
          equal(Markethistory.find({_id: ids[0] + 'x'}).count(), 0, 'the ones after it are not made');
        } finally {
          Markethistory.remove({_id: {$in: ids.concat([ids[0] + 'x'])}});
        }
      });

      run('queue: Queues.addAsyncOrLog logs a job it can\'t add and resolves with false, as Queues.add only logged it', function() {
        var addAsync = Queues.addAsync;
        var result;
        Queues.addAsync = async function() { throw new Error('test: redis is down'); };
        try {
          var logged = captureErrors(function() {
            return Queues.addAsyncOrLog('destroyKingChatroom', {king_id: 'x'}, {}, false).then(function(r) { result = r; });
          });
          equal(result, false, 'resolves with false');
          assert(logged.length === 1 && logged[0].indexOf('could not add job destroyKingChatroom') === 0 &&
            logged[0].indexOf('test: redis is down') !== -1, 'logged: ' + logged.join(' | '));
        } finally {
          Queues.addAsync = addAsync;
        }
      });

      run('test runner: while the suites run, Queues.addAsync goes through a replaced Queues.add, so recordJobs sees it', function() {
        var results = [];
        var jobs = dTest.recordJobs(function() {
          results.push(dTest.settle(Queues.addAsync('destroyKingChatroom', {king_id: 'a'}, {delay: 0}, 'a')));
          results.push(dTest.settle(Queues.addAsyncOrLog('destroyKingChatroom', {king_id: 'b'}, {}, false)));
        });
        equal(JSON.stringify(jobs.map(function(j) { return [j.name, j.data.king_id, j.uniqueId]; })),
          '[["destroyKingChatroom","a","a"],["destroyKingChatroom","b",false]]', 'both recorded, none added to Bull');
        equal(results.join(), 'true,true', 'each resolves with true');

        var during = Queues.addAsync;
        var unfollow = dTest.followQueuesAdd();
        assert(Queues.addAsync !== during, 'a second follower wraps it again');
        unfollow();
        assert(Queues.addAsync === during, 'and puts it back');
      });
    });
  });
}
