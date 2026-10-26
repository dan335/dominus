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
    dTest.addSuite('async foundations (server/asyncFoundationTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var isWorker = process.env.DOMINUS_WORKER == 'true';
      var cache = _gs._cachedGames;

      // the console.error lines logged while fn runs
      async function captureErrors(fn) {
        var logged = [];
        var error = console.error;
        console.error = function() { logged.push(_.toArray(arguments).join(' ')); };
        try {
          await fn();
        } finally {
          console.error = error;
        }
        return logged;
      }

      function game(overrides) {
        return t.createTestGame(_.extend({name: 'Async foundations ' + Random.id(4), isStarting: true}, overrides || {}));
      }


      // --- The settings cache ---

      await run('settings cache: every game is cached, whether it has started, ended or closed', async function() {
        var games = [
          await game({hasStarted: false}),
          await game({hasStarted: true, hasEnded: false}),
          await game({hasStarted: true, hasEnded: true}),
          await game({hasStarted: true, hasEnded: true, hasClosed: true, isSpeed: true})
        ];
        try {
          assert(await dTest.waitFor(function() { return games.every(function(g) { return !!cache[g._id]; }); }), 'all four cached');
          equal(cache[games[3]._id].isSpeed, true, 'with their settings');
          var allowed = ['_id'].concat(_.keys(_gs._settingsFields));
          equal(_.difference(_.keys(cache[games[3]._id]), allowed).join(','), '', 'nothing but the settings');
          equal(cache[games[3]._id].maxPlayers, 200, 'every setting the game has');
        } finally {
          await dTest.eachAsync(games, async function(g) { await t.cleanup(g._id); });
        }
      });

      await run('a rejection nobody handles is logged, and doesn\'t end the server (server/lib/unhandledRejections.js)', async function() {
        // Node 24 ends the process on one unless something listens for it
        var ours = process.listeners('unhandledRejection').filter(function(fn) { return String(fn).indexOf('Unhandled rejection:') !== -1; });
        equal(ours.length, 1, 'the app listens for them');
        var logged = await captureErrors(function() { ours[0](new Error('nobody waited')); });
        assert(logged.length == 1 && logged[0].indexOf('Unhandled rejection:') === 0 && logged[0].indexOf('nobody waited') !== -1, 'logged with its stack: ' + logged[0]);
      });

      await run('settings cache: _gs.ready has filled it with every game in the database', async function() {
        equal(dTest.isPromise(_gs.ready), true, '_gs.ready is a promise');
        await _gs.ready;
        var missing = (await Games.find({}, {fields: {_id: 1}}).fetchAsync()).filter(function(g) { return !cache[g._id]; });
        equal(missing.length, 0, 'games missing from the cache: ' + _.pluck(missing, '_id').join(','));
      });

      await run('settings cache: _gs._fill reads every game into an empty cache, as at startup', async function() {
        var g = await game({isRelaxed: true});
        var saved = _.clone(cache);
        try {
          assert(await dTest.waitFor(function() { return !!cache[g._id]; }), 'cached');
          _.keys(cache).forEach(function(id) { delete cache[id]; });
          await _gs._fill();
          equal(_.keys(cache).length, await Games.find().countAsync(), 'every game');
          equal(cache[g._id].isRelaxed, true, 'with its settings');
        } finally {
          _.extend(cache, saved);
          await t.cleanup(g._id);
        }
      });

      await run('settings cache: ensureGame reads a game that is not cached; a gameId that is not a game is left out', async function() {
        var g = await game({isCrazyFast: true});
        try {
          assert(await dTest.waitFor(function() { return !!cache[g._id]; }), 'cached by the observer');
          delete cache[g._id];
          await _gs.ensureGame(g._id);
          equal(cache[g._id] && cache[g._id].isCrazyFast, true, 'read back in by ensureGame');
          await _gs.ensureGame('noSuchGame_' + Random.id());
          equal(_.keys(cache).filter(function(id) { return id.indexOf('noSuchGame_') === 0; }).length, 0, 'not a game: not cached');
          await _gs.ensureGame(undefined);
          await _gs.ensureGame(null);
        } finally {
          await t.cleanup(g._id);
        }
      });

      await run('settings cache: a game method gets its game cached before it runs (server/methodGate.js)', async function() {
        var w = await dTest.buildGameWorld({players: 1});
        var client = await dTest.ddp.connect(w.users[0]._id);
        var name = 'asyncFoundationTestsReadsSettings';
        MethodPolicy[name] = {access: 'game', game: function(args) { return {gameId: args[0]}; }};
        Meteor.methods(_.object([[name, function(gameId) {
          check(gameId, String);
          return {cached: !!cache[gameId], isSpeed: _gs.getGame(gameId).isSpeed === true};
        }]]));
        dGate.wrapAll();
        try {
          await Games.updateAsync(w.gameId, {$set: {isSpeed: true}});
          assert(await dTest.waitFor(function() { return cache[w.gameId] && cache[w.gameId].isSpeed === true; }), 'cached by the observer');
          delete cache[w.gameId];
          dTest.ddp.resetRateLimits();
          equal(JSON.stringify(await client.call(name, w.gameId)), JSON.stringify({cached: true, isSpeed: true}),
            'the method reads the game\'s settings, though the game was not cached when it was called');
        } finally {
          client.close();
          delete Meteor.server.method_handlers[name];
          delete MethodPolicy[name];
          await w.cleanup();
        }
      });

      await run('settings cache: a miss logs where it came from, once per game, reads as the defaults, and ensureGame caches the game', async function() {
        var g = await game({isSpeed: true});
        try {
          assert(await dTest.waitFor(function() { return !!cache[g._id]; }), 'cached');
          delete cache[g._id];
          delete _gs._missesLogged[g._id];
          var value;
          var logged = await captureErrors(function() { value = [_gs.getGame(g._id), _gs.getGame(g._id)]; });
          equal(JSON.stringify(value), '[{},{}]', 'the game reads as {}: the server can\'t read it without waiting');
          equal(logged.length, 1, 'one line logged');
          assert(logged[0].indexOf(g._id) >= 0 && logged[0].indexOf('settings cache miss') >= 0 &&
            logged[0].indexOf('asyncFoundationTests') >= 0, 'with the gameId and a stack that names the caller: ' + logged[0]);
          await _gs.ensureGame(g._id);
          equal(cache[g._id] && cache[g._id].isSpeed, true, 'ensureGame caches the game again');
          equal(_gs.getGame(g._id).isSpeed, true, 'and its settings read as they are');

          var missing = 'noSuchGame_' + Random.id();
          var reads = [];
          logged = await captureErrors(function() { reads = [_gs.getGame(missing), _gs.getGame(missing)]; });
          equal(JSON.stringify(reads), '[{},{}]', 'a gameId that is not a game reads as {}');
          equal(logged.length, 1, 'logged once, not on every read');
          equal(JSON.stringify(_gs.getGame(undefined)), '{}', 'no gameId: {}');
        } finally {
          await t.cleanup(g._id);
        }
      });

      // the observer would cache a new game a moment later anyway, so these
      // check that the code caches it itself, before it returns
      async function cachedWhile(fn) {
        var cached = [];
        var cacheGame = _gs.cacheGame;
        _gs.cacheGame = function(doc) { cached.push(_.clone(doc)); return cacheGame(doc); };
        try {
          await fn();
        } finally {
          _gs.cacheGame = cacheGame;
        }
        return cached;
      }

      await run('settings cache: dManager.createNextGame caches the game it makes', async function() {
        await Games.removeAsync({});
        var gameId = null;
        var cached = await cachedWhile(async function() { gameId = await dManager.createNextGame(); });
        try {
          assert(gameId, 'a game was made');
          equal(cached.length, 1, 'one game cached');
          equal(cached[0]._id, gameId, 'the new one');
          equal(cache[gameId] && cache[gameId].maxPlayers, 50, 'with its settings');
        } finally {
          if (gameId) await t.cleanup(gameId);
        }
      });

      await run('settings cache: addOrEditGame caches the game it makes', async function() {
        var admin = await t.createTestUser({username: 'async_admin_' + Random.id(4)});
        await Meteor.users.updateAsync(admin._id, {$set: {admin: true}});
        var invocation = {userId: admin._id, isSimulation: false, connection: null, unblock: function() {}, setUserId: function() {}};
        var gameId = null;
        var cached = await cachedWhile(async function() {
          gameId = await Meteor.server.method_handlers.addOrEditGame.apply(invocation,
            ['Async Cache Game', '', 20, '2030-01-02 03:04', false, true, false, false, false, false]);
        });
        try {
          assert(gameId, 'a game was made');
          equal(cached.length, 1, 'one game cached');
          equal(cached[0]._id, gameId, 'the new one');
          equal(cache[gameId] && cache[gameId].isSpeed, true, 'with its settings');
        } finally {
          if (gameId) await t.cleanup(gameId);
          await t.cleanupUser(admin._id);
        }
      });

      await run('settings cache: no job is taken before the cache is full, and a job\'s game is cached before it runs', async function() {
        if (!isWorker) return 'skip';
        var g = await game({isNoLargeResources: true});
        var ready = _gs.ready;
        var release;
        try {
          assert(await dTest.waitFor(function() { return !!cache[g._id]; }), 'cached');
          if (!readyQueue) {
            _gs.ready = new Promise(function(resolve) { release = resolve; });
            Queues.create('asyncFoundationReadyQueue');
            readyQueue = Queues.asyncFoundationReadyQueue;
            readyQueue.process(Meteor.bindEnvironment(function(job) {
              readyQueueRuns.push({gameId: job.data.gameId, cached: !!cache[job.data.gameId]});
              return Promise.resolve();
            }));
            await readyQueue.add({gameId: g._id});
            await dTest.sleep(1500);
            equal(readyQueueRuns.length, 0, 'no job before _gs.ready');
            release();
            assert(await dTest.waitFor(function() { return readyQueueRuns.length === 1; }, 10000), 'the job ran once _gs.ready resolved');
          }
          readyQueueRuns.length = 0;
          delete cache[g._id];
          await readyQueue.add({gameId: g._id});
          assert(await dTest.waitFor(function() { return readyQueueRuns.length === 1; }, 10000), 'the job ran');
          equal(readyQueueRuns[0].cached, true, 'its game was in the cache when it started');
        } finally {
          if (release) release();
          _gs.ready = ready;
          await t.cleanup(g._id);
        }
      });


      // --- dMarket async twins ---

      await run('dMarket: total_of_buyAsync and total_of_sellAsync give what total_of_buy and total_of_sell give', async function() {
        var w = await dTest.buildGameWorld({players: 1});
        try {
          var types = _.pluck(await Market.find({gameId: w.gameId}).fetchAsync(), 'type');
          assert(types.length >= 4, 'a market (' + types.join(',') + ')');
          var quantities = [0, 1, 7, 250, 0.5];
          // the sync ones as the browser runs them, on minimongo
          var browser = await dTest.onClient(function() {
            return types.map(function(type) {
              return quantities.map(function(quantity) {
                return [dMarket.total_of_buy(w.gameId, type, quantity), dMarket.total_of_sell(w.gameId, type, quantity)];
              });
            });
          });
          for (var [i, type] of types.entries()) {
            for (var [j, quantity] of quantities.entries()) {
              equal(await dMarket.total_of_buyAsync(w.gameId, type, quantity), browser[i][j][0], 'buy ' + quantity + ' ' + type);
              equal(await dMarket.total_of_sellAsync(w.gameId, type, quantity), browser[i][j][1], 'sell ' + quantity + ' ' + type);
            }
          }
          assert(browser[0][1][0] > 0, 'a resource costs something');
          equal(await dMarket.total_of_buyAsync(w.gameId, 'noSuchResource', 5), false, 'buy: no such resource');
          equal(await dMarket.total_of_sellAsync('noSuchGame', 'ore', 5), false, 'sell: no such game');
        } finally {
          await w.cleanup();
        }
      });

      // upgrade PR 10
      await run('dMarket: resourcesToGoldAsync gives what resourcesToGold gives, and refuses what it refuses', async function() {
        var w = await dTest.buildGameWorld({players: 1});
        try {
          var cases = [{}, {gold: 12.5}, {grain: 1}, {grain: 3, lumber: 0.25, ore: 7, wool: 1, clay: 2, glass: 9, gold: 4},
            {grain: 1e6, gold: 0}, {wool: 0, clay: 0}, {grain: 5, notAResource: 99}];
          _s.market.types.forEach(function(type) { var r = {}; r[type] = 3.3; cases.push(r); });
          var bads = [[w.gameId, {grain: -1}], [w.gameId, {ore: 'x'}], [w.gameId, {wool: NaN}], [1, {grain: 1}]];
          // the sync one as the browser runs it, on minimongo
          var browser = await dTest.onClient(function() {
            return {
              cases: cases.map(function(resources) { return dMarket.resourcesToGold(w.gameId, resources); }),
              bads: bads.map(function(bad) { return dTest.outcome(function() { return dMarket.resourcesToGold.apply(null, bad); }); })
            };
          });
          for (var [i, resources] of cases.entries()) {
            equal(await dMarket.resourcesToGoldAsync(w.gameId, resources), browser.cases[i], JSON.stringify(resources));
          }
          assert(browser.cases[2] > 0, 'grain is worth some gold');
          equal(await dMarket.resourcesToGoldAsync('noSuchGame', {grain: 5, gold: 2}), 2, 'no such game: only the gold');
          var refused = 0;
          for (var [k, bad] of bads.entries()) {
            var syncError = browser.bads[k].error || null, asyncError = null;
            try { await dMarket.resourcesToGoldAsync.apply(null, bad); } catch (e) { asyncError = e; }
            equal(!!asyncError, !!syncError, JSON.stringify(bad) + ' refused by both or neither');
            if (syncError) {
              refused++;
              equal(asyncError.message, syncError.message, JSON.stringify(bad) + ' with the same error');
            } else {
              equal(await dMarket.resourcesToGoldAsync.apply(null, bad), browser.bads[k].value, JSON.stringify(bad) + ' gives the same');
            }
          }
          assert(refused >= 1, 'some are refused (' + refused + ')');
        } finally {
          await w.cleanup();
        }
      });

      // upgrade PR 15: the gamestats job uses worthAsync
      await run('dArmies: worthAsync gives what worth gives, and refuses what it refuses', async function() {
        var w = await dTest.buildGameWorld({players: 1});
        try {
          var cases = [{}, {footmen: 1}, {footmen: 3, archers: 2, pikemen: 1, cavalry: 4, catapults: 1}];
          _s.armies.types.forEach(function(type) { var s = {}; s[type] = 1; cases.push(s); });
          var bads = [[w.gameId, {footmen: 1.5}], [w.gameId, {archers: 'x'}], [1, {footmen: 1}]];
          // the sync one as the browser runs it, on minimongo
          var browser = await dTest.onClient(function() {
            return {
              cases: cases.map(function(soldiers) { return dArmies.worth(w.gameId, _.clone(soldiers)); }),
              bads: bads.map(function(bad) { return dTest.outcome(function() { return dArmies.worth.apply(null, _.clone(bad)); }); })
            };
          });
          for (var [i, soldiers] of cases.entries()) {
            equal(await dArmies.worthAsync(w.gameId, _.clone(soldiers)), browser.cases[i], JSON.stringify(soldiers));
          }
          assert(browser.cases[1] > 0, 'a soldier is worth something');
          var refused = 0;
          for (var [k, bad] of bads.entries()) {
            var syncError = browser.bads[k].error || null, asyncError = null;
            try { await dArmies.worthAsync.apply(null, _.clone(bad)); } catch (e) { asyncError = e; }
            equal(!!asyncError, !!syncError, JSON.stringify(bad) + ' refused by both or neither');
            if (syncError) {
              refused++;
              equal(asyncError.message, syncError.message, JSON.stringify(bad) + ' with the same error');
            }
          }
          equal(refused, 3, 'all three refused');
        } finally {
          await w.cleanup();
        }
      });

      await run('dMarket: the async twins accept and refuse the same arguments, with the same errors', async function() {
        var w = await dTest.buildGameWorld({players: 1});
        try {
          var cases = [[w.gameId, 'ore', -1], [w.gameId, 'ore', 'x'], [w.gameId, 1, 5], [1, 'ore', 5],
            [w.gameId, 'ore', NaN], [w.gameId, 'ore', Infinity], [w.gameId, 'ore', null], [w.gameId, 'ore']];
          var names = ['total_of_buy', 'total_of_sell'];
          // the sync ones as the browser runs them, on minimongo
          var browser = await dTest.onClient(function() {
            return cases.map(function(args) {
              return names.map(function(name) { return dTest.outcome(function() { return dMarket[name].apply(null, args); }); });
            });
          });
          var refused = 0;
          for (var [i, args] of cases.entries()) {
            for (var [j, name] of names.entries()) {
              var label = name + JSON.stringify(args);
              var syncValue = browser[i][j].value, syncError = browser[i][j].error || null, asyncValue, asyncError = null;
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
          await w.cleanup();
        }
      });


      // --- How Meteor 2.16 runs async code ---

      await run('async code on 2.16: after an await, sync Meteor calls still work (so entry points can become async first)', async function() {
        var g = await game();
        try {
          await new Promise(function(resolve) { setTimeout(resolve, 10); });
          equal((await Games.findOneAsync(g._id)).name, g.name, 'a sync findOne after an await');
          await Games.updateAsync(g._id, {$set: {desc: 'after await'}});
          await Promise.resolve();
          equal((await Games.findOneAsync(g._id)).desc, 'after await', 'a sync update after an await');
          await dTest.sleep(1);
          equal((await Games.findOneAsync(g._id)).desc, 'after await', 'and the async API');
        } finally {
          await t.cleanup(g._id);
        }
      });

      // A missing await shows on 2.16 too: the caller goes on before the
      // work is done, as on Meteor 3. So the suites can catch one, and
      // check-await (tests/async) finds them before they run.
      await run('async code: an async function that is not awaited is still running when the caller goes on, and an array\'s forEach does not wait for async callbacks', async function() {
        var done = false;
        var work = async function() {
          await new Promise(function(resolve) { setTimeout(resolve, 50); });
          done = true;
        };
        var promise = work();
        equal(done, false, 'not finished when the caller goes on');
        await promise;
        equal(done, true, 'finished once awaited');

        var callbacks = 0;
        // check-await: ignore this test shows what the checker guards against
        [1, 2].forEach(async function() {
          await new Promise(function(resolve) { setTimeout(resolve, 20); });
          callbacks++;
        });
        equal(callbacks, 0, 'forEach went on before its callbacks finished');
        await dTest.sleep(200);
        equal(callbacks, 2, 'they finish later');
      });

      // Meteor 2.16's cursor forEach and map wait for a callback's promise
      // (Meteor.wrapFn), and so do forEachAsync and mapAsync, which call
      // them; Meteor 3's forEachAsync awaits each callback.
      await run('async code: a cursor\'s forEachAsync waits for an async callback', async function() {
        var games = [await game(), await game()];
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
          await dTest.eachAsync(games, async function(g) { await t.cleanup(g._id); });
        }
      });

      // --- adding jobs from async code (since upgrade PR 8) ---

      // upgrade PR 10: the income jobs' bulk writes
      await run('income: dIncome.executeBulk writes a bulk op, and logs a failed one instead of throwing, as its callbacks did', async function() {
        var ids = ['execBulk_' + Random.id(6), 'execBulk_' + Random.id(6)];
        try {
          var bulk = Markethistory.rawCollection().initializeOrderedBulkOp();
          bulk.insert({_id: ids[0], quantity: 1});
          var logged = await captureErrors(function() { return dIncome.executeBulk(bulk); });
          equal(logged.length, 0, 'nothing logged');
          equal(await Markethistory.find({_id: ids[0]}).countAsync(), 1, 'written');

          // the second insert has the same _id, so the ordered bulk stops there
          var failing = Markethistory.rawCollection().initializeOrderedBulkOp();
          failing.insert({_id: ids[1], quantity: 1});
          failing.insert({_id: ids[1], quantity: 2});
          failing.insert({_id: ids[0] + 'x', quantity: 3});
          var result = 'not settled';
          logged = await captureErrors(function() { return dIncome.executeBulk(failing).then(function(r) { result = r; }); });
          equal(result, undefined, 'resolves');
          equal(logged.length, 1, 'the error is logged');
          assert(/E11000|duplicate key/.test(logged[0]), 'the duplicate key: ' + logged[0]);
          equal((await Markethistory.find({_id: ids[1]}).fetchAsync()).map(function(d) { return d.quantity; }).join(), '1', 'the writes before it are kept');
          equal(await Markethistory.find({_id: ids[0] + 'x'}).countAsync(), 0, 'the ones after it are not made');
        } finally {
          await Markethistory.removeAsync({_id: {$in: ids.concat([ids[0] + 'x'])}});
        }
      });

      await run('queue: Queues.addAsyncOrLog logs a job it can\'t add and resolves with false', async function() {
        var addAsync = Queues.addAsync;
        var result;
        Queues.addAsync = async function() { throw new Error('test: redis is down'); };
        try {
          var logged = await captureErrors(function() {
            return Queues.addAsyncOrLog('destroyKingChatroom', {king_id: 'x'}, {}, false).then(function(r) { result = r; });
          });
          equal(result, false, 'resolves with false');
          assert(logged.length === 1 && logged[0].indexOf('could not add job destroyKingChatroom') === 0 &&
            logged[0].indexOf('test: redis is down') !== -1, 'logged: ' + logged.join(' | '));
        } finally {
          Queues.addAsync = addAsync;
        }
      });

      await run('test runner: recordJobs records the jobs added with Queues.addAsync and addAsyncOrLog, and waits for fn\'s promise', async function() {
        var results = [];
        var jobs = await dTest.recordJobs(async function() {
          results.push(await Queues.addAsync('destroyKingChatroom', {king_id: 'a'}, {delay: 0}, 'a'));
          results.push(await Queues.addAsyncOrLog('destroyKingChatroom', {king_id: 'b'}, {}, false));
          return (async function() {
            await new Promise(function(resolve) { setTimeout(resolve, 20); });
            results.push(await Queues.addAsyncOrLog('destroyKingChatroom', {king_id: 'c'}, {}, false));
          })();
        });
        equal(JSON.stringify(jobs.map(function(j) { return [j.name, j.data.king_id, j.uniqueId]; })),
          '[["destroyKingChatroom","a","a"],["destroyKingChatroom","b",false],["destroyKingChatroom","c",false]]',
          'all recorded, the one added after fn\'s first await too, none added to Bull');
        equal(results.join(), 'true,true,true', 'each resolves with true');
        var original = Queues.addAsync;
        await dTest.recordJobs(function() {});
        assert(Queues.addAsync === original, 'Queues.addAsync is put back');
      });
    });
  });
}
