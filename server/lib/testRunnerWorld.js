// A real game for tests to play in (Oct 2026): a started game on a generated
// map, with players created the way the game creates them (dManager.startGame
// -> dCastles.createPlayer), so castles, resources and the market are real.
// Loaded after server/lib/testRunner.js (same folder, sorts after it).

if (Meteor.isServer) {

  // every collection that holds game state, all keyed by gameId
  dTest.gameCollections = function() {
    return [Players, Castles, Villages, Armies, Armypaths, Capitals, Hexes, Countries, Rooms, Roomchats,
      Recentchats, Alerts, GlobalAlerts, Markers, MarkerGroups, Market, Markethistory, Battles2, Reports,
      Gamesignups, Dailystats, Gamestats];
  };

  // Waits until no Bull job is waiting or running, so jobs a test started
  // (enterNewHexCheck after an army is created, and so on) don't land in the
  // middle of the next check. Delayed jobs (retries) don't count.
  // A job still running when this looks may add another after it: a test
  // that needs a job's result should waitFor the result.
  dTest.waitForJobs = async function(ms) {
    await dTest.sleep(50);
    var busy = async function() {
      return await dTest.filterAsync(Queues.queueNames, async function(name) {
        var counts = await Queues[name].getJobCounts();
        return (counts.wait || counts.waiting || 0) + (counts.active || 0) > 0;
      });
    };
    if (!await dTest.waitFor(async function() { return !(await busy()).length; }, ms || 15000)) {
      throw new Error('FAIL: jobs still running: ' + (await busy()).join(', '));
    }
  };

  // The game's documents in collections (default: the ones game methods
  // change), for checking that a refused call changed nothing.
  dTest.snapshot = async function(gameId, collections) {
    collections = collections || [Players, Castles, Villages, Armies, Armypaths, Market];
    var out = {};
    await dTest.eachAsync(collections, async function(collection) {
      out[collection._name] = await collection.find({gameId: gameId}, {sort: {_id: 1}}).fetchAsync();
    });
    return JSON.stringify(out);
  };

  // throws unless the game's documents are the same as in an earlier snapshot
  dTest.assertUnchanged = async function(gameId, before, message, collections) {
    var after = await dTest.snapshot(gameId, collections);
    if (after !== before) {
      var a = JSON.parse(before);
      var b = JSON.parse(after);
      var changed = _.filter(_.keys(b), function(name) { return !_.isEqual(a[name], b[name]); });
      throw new Error('FAIL: ' + message + ' (changed: ' + changed.join(', ') + ')');
    }
  };

  // the error a call threw, checked against error.error (and the
  // ValidationError detail type, when given)
  dTest.expectError = async function(fn, code, detailType, message) {
    var e = await dTest.throws(fn);
    dTest.helpers.assert(e, message + ': expected error ' + code + ', but the call succeeded');
    dTest.helpers.equal(e.error, code, message + ': error code (reason: ' + e.reason + ')');
    if (detailType) {
      var types = _.pluck(e.details || [], 'type');
      dTest.helpers.assert(_.contains(types, detailType), message + ': expected detail "' + detailType + '", got ' + JSON.stringify(types));
    }
    return e;
  };

  // every soldier type, 0 unless given
  dTest.soldierCounts = function(values) {
    var out = {};
    _s.armies.types.forEach(function(type) { out[type] = values[type] || 0; });
    return out;
  };

  // A test(name, fn) for contract suites: each test starts with a full rate
  // limit allowance and no jobs in flight, and after(), when given, cleans up
  // once the test's jobs have finished.
  dTest.contractTest = function(run, after) {
    return async function(name, fn) {
      await run(name, async function() {
        await dTest.waitForJobs();
        dTest.ddp.resetRateLimits();
        try {
          return await fn();
        } finally {
          await dTest.waitForJobs();
          if (after) await after();
        }
      });
    };
  };

  // opts.players: how many players (default 3)
  // opts.users: user docs to play as, instead of new test users
  // opts.game: extra fields for the Games doc
  // Returns {gameId, users, players, castles, player(i), castle(i), cleanup()}.
  dTest.buildGameWorld = async function(opts) {
    opts = opts || {};
    var count = opts.users ? opts.users.length : (opts.players || 3);
    var w = {users: [], players: [], castles: []};

    // isStarting, as the start job sets it, so that job never starts this game
    // a second time (it can run when the world is built outside runAllTests)
    var game = await dTest.helpers.createTestGame(_.extend({name: 'World ' + Random.id(4), isStarting: true}, opts.game || {}));
    w.gameId = game._id;

    for (var i = 0; i < count; i++) {
      var user = opts.users ? opts.users[i] : await dTest.helpers.createTestUser({username: 'world_' + Random.id(6)});
      w.users.push(user);
      await Gamesignups.insertAsync({gameId: w.gameId, userId: user._id, username: user.username, createdAt: new Date(), usedToken: false});
    }

    // one country to start on; createPlayer adds more when it needs room
    var sizes = _.pick(_s.mapmaker, 'minHexesInCountry', 'maxHexesInCountry');
    try {
      await Mapmaker.eraseMap(w.gameId);
      _s.mapmaker.minHexesInCountry = 200;
      _s.mapmaker.maxHexesInCountry = 200;
      await Mapmaker.addCountry(w.gameId, true);
      await dManager.startGame(await Games.findOneAsync(w.gameId), true);
    } finally {
      _.extend(_s.mapmaker, sizes);
    }

    // Placing a castle is random and now and then finds no room even after
    // the game adds a country (about 1 build in 15 with 100 hex countries).
    // Try again the way a late joiner would be added.
    await dTest.eachAsync(w.users, async function(user) {
      for (var tries = 0; tries < 3 && !await Players.findOneAsync({gameId: w.gameId, userId: user._id}); tries++) {
        console.log('buildGameWorld: placing ' + user.username + ' again');
        await dCastles.createPlayer(w.gameId, user._id, user.username, false);
      }
    });

    await dTest.eachAsync(w.users, async function(user) {
      var player = await Players.findOneAsync({gameId: w.gameId, userId: user._id});
      if (!player) throw new Error('FAIL: buildGameWorld could not create a player for ' + user.username);
      w.players.push(player);
      w.castles.push(await Castles.findOneAsync(player.castle_id));
    });

    // fresh copies, since methods change them
    w.player = async function(i) { return await Players.findOneAsync(w.players[i]._id); };
    w.castle = async function(i) { return await Castles.findOneAsync(w.castles[i]._id); };

    // sets every resource and gold; the ones not given to 0
    w.setResources = async function(i, values) {
      var set = {};
      _s.market.types_plus_gold.forEach(function(type) { set[type] = 0; });
      await Players.updateAsync(w.players[i]._id, {$set: _.extend(set, values)});
    };

    w.setCastleSoldiers = async function(i, soldiers) {
      await Castles.updateAsync(w.castles[i]._id, {$set: dTest.soldierCounts(soldiers)});
    };

    // a hex in the game with no building on it, that armies can stand on;
    // filter(hex) narrows it further
    w.freeHex = async function(skip, filter) {
      var taken = {};
      await Castles.find({gameId: w.gameId}).forEachAsync(function(c) { taken[c.x + '_' + c.y] = true; });
      await Villages.find({gameId: w.gameId}).forEachAsync(function(v) { taken[v.x + '_' + v.y] = true; });
      (skip || []).forEach(function(h) { taken[h.x + '_' + h.y] = true; });
      var hex = await dTest.findAsync(await Hexes.find({gameId: w.gameId}, {sort: {x: 1, y: 1}}).fetchAsync(), async function(h) {
        return !taken[h.x + '_' + h.y] && !h.hasBuilding && (!filter || filter(h)) && await Mapmaker.coordsToCountryId(w.gameId, h.x, h.y);
      });
      if (!hex) throw new Error('FAIL: no free hex in the test world');
      return {x: hex.x, y: hex.y};
    };

    // an army for player i (default: at their castle), after its jobs ran
    w.makeArmy = async function(i, soldiers, at) {
      at = at || {x: (await w.castle(i)).x, y: (await w.castle(i)).y};
      var army = await dArmies.create(w.players[i]._id, soldiers || {footmen: 3}, at.x, at.y);
      if (!army) throw new Error('FAIL: could not create a test army');
      await dTest.waitForJobs();
      return await Armies.findOneAsync(army._id);
    };

    w.removeArmies = async function() {
      await Armies.find({gameId: w.gameId}).forEachAsync(async function(a) { await dArmies.destroyArmy(a._id); });
    };

    w.cleanup = async function() {
      await dTest.eachAsync(dTest.gameCollections(), async function(collection) {
        await collection.removeAsync({gameId: w.gameId});
      });
      await Games.removeAsync(w.gameId);
      await dTest.eachAsync(w.users, async function(user) {
        await Markers.removeAsync({user_id: user._id});
        await MarkerGroups.removeAsync({user_id: user._id});
        await Meteor.users.removeAsync(user._id);
      });
    };

    return w;
  };
}
