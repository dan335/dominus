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
  // Queues.add doesn't wait for Redis, so a job added a moment ago may not be
  // counted yet: a test that needs a job's result should waitFor the result.
  dTest.waitForJobs = function(ms) {
    dTest.sleep(50);
    var busy = function() {
      return _.filter(Queues.queueNames, function(name) {
        var counts = dTest.settle(Queues[name].getJobCounts());
        return (counts.wait || counts.waiting || 0) + (counts.active || 0) > 0;
      });
    };
    if (!dTest.waitFor(function() { return !busy().length; }, ms || 15000)) {
      throw new Error('FAIL: jobs still running: ' + busy().join(', '));
    }
  };

  // The game's documents in collections (default: the ones game methods
  // change), for checking that a refused call changed nothing.
  dTest.snapshot = function(gameId, collections) {
    collections = collections || [Players, Castles, Villages, Armies, Armypaths, Market];
    var out = {};
    collections.forEach(function(collection) {
      out[collection._name] = collection.find({gameId: gameId}, {sort: {_id: 1}}).fetch();
    });
    return JSON.stringify(out);
  };

  // throws unless the game's documents are the same as in an earlier snapshot
  dTest.assertUnchanged = function(gameId, before, message, collections) {
    var after = dTest.snapshot(gameId, collections);
    if (after !== before) {
      var a = JSON.parse(before);
      var b = JSON.parse(after);
      var changed = _.filter(_.keys(b), function(name) { return !_.isEqual(a[name], b[name]); });
      throw new Error('FAIL: ' + message + ' (changed: ' + changed.join(', ') + ')');
    }
  };

  // the error a call threw, checked against error.error (and the
  // ValidationError detail type, when given)
  dTest.expectError = function(fn, code, detailType, message) {
    var e = dTest.throws(fn);
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
    return function(name, fn) {
      run(name, function() {
        dTest.waitForJobs();
        dTest.ddp.resetRateLimits();
        try {
          return dTest.settle(fn());
        } finally {
          dTest.waitForJobs();
          if (after) after();
        }
      });
    };
  };

  // opts.players: how many players (default 3)
  // opts.game: extra fields for the Games doc
  // Returns {gameId, users, players, castles, player(i), castle(i), cleanup()}.
  dTest.buildGameWorld = function(opts) {
    opts = opts || {};
    var count = opts.players || 3;
    var w = {users: [], players: [], castles: []};

    // isStarting, as the start job sets it, so that job never starts this game
    // a second time (it can run when the world is built outside runAllTests)
    var game = dTest.helpers.createTestGame(_.extend({name: 'World ' + Random.id(4), isStarting: true}, opts.game || {}));
    w.gameId = game._id;

    for (var i = 0; i < count; i++) {
      var user = dTest.helpers.createTestUser({username: 'world_' + Random.id(6)});
      w.users.push(user);
      Gamesignups.insert({gameId: w.gameId, userId: user._id, username: user.username, createdAt: new Date(), usedToken: false});
    }

    // one country to start on; createPlayer adds more when it needs room
    var sizes = _.pick(_s.mapmaker, 'minHexesInCountry', 'maxHexesInCountry');
    try {
      Mapmaker.eraseMap(w.gameId);
      _s.mapmaker.minHexesInCountry = 200;
      _s.mapmaker.maxHexesInCountry = 200;
      Mapmaker.addCountry(w.gameId, true);
      dManager.startGame(Games.findOne(w.gameId), true);
    } finally {
      _.extend(_s.mapmaker, sizes);
    }

    // Placing a castle is random and now and then finds no room even after
    // the game adds a country (about 1 build in 15 with 100 hex countries).
    // Try again the way a late joiner would be added.
    w.users.forEach(function(user) {
      for (var tries = 0; tries < 3 && !Players.findOne({gameId: w.gameId, userId: user._id}); tries++) {
        console.log('buildGameWorld: placing ' + user.username + ' again');
        dCastles.createPlayer(w.gameId, user._id, user.username, false);
      }
    });

    w.users.forEach(function(user) {
      var player = Players.findOne({gameId: w.gameId, userId: user._id});
      if (!player) throw new Error('FAIL: buildGameWorld could not create a player for ' + user.username);
      w.players.push(player);
      w.castles.push(Castles.findOne(player.castle_id));
    });

    // fresh copies, since methods change them
    w.player = function(i) { return Players.findOne(w.players[i]._id); };
    w.castle = function(i) { return Castles.findOne(w.castles[i]._id); };

    // sets every resource and gold; the ones not given to 0
    w.setResources = function(i, values) {
      var set = {};
      _s.market.types_plus_gold.forEach(function(type) { set[type] = 0; });
      Players.update(w.players[i]._id, {$set: _.extend(set, values)});
    };

    w.setCastleSoldiers = function(i, soldiers) {
      Castles.update(w.castles[i]._id, {$set: dTest.soldierCounts(soldiers)});
    };

    // a hex in the game with no building on it, that armies can stand on;
    // filter(hex) narrows it further
    w.freeHex = function(skip, filter) {
      var taken = {};
      Castles.find({gameId: w.gameId}).forEach(function(c) { taken[c.x + '_' + c.y] = true; });
      Villages.find({gameId: w.gameId}).forEach(function(v) { taken[v.x + '_' + v.y] = true; });
      (skip || []).forEach(function(h) { taken[h.x + '_' + h.y] = true; });
      var hex = _.find(Hexes.find({gameId: w.gameId}, {sort: {x: 1, y: 1}}).fetch(), function(h) {
        return !taken[h.x + '_' + h.y] && !h.hasBuilding && (!filter || filter(h)) && Mapmaker.coordsToCountryId(w.gameId, h.x, h.y);
      });
      if (!hex) throw new Error('FAIL: no free hex in the test world');
      return {x: hex.x, y: hex.y};
    };

    // an army for player i (default: at their castle), after its jobs ran
    w.makeArmy = function(i, soldiers, at) {
      at = at || {x: w.castle(i).x, y: w.castle(i).y};
      var army = dArmies.create(w.players[i]._id, soldiers || {footmen: 3}, at.x, at.y);
      if (!army) throw new Error('FAIL: could not create a test army');
      dTest.waitForJobs();
      return Armies.findOne(army._id);
    };

    w.removeArmies = function() {
      Armies.find({gameId: w.gameId}).forEach(function(a) { dArmies.destroyArmy(a._id); });
    };

    w.cleanup = function() {
      dTest.gameCollections().forEach(function(collection) {
        collection.remove({gameId: w.gameId});
      });
      Games.remove(w.gameId);
      w.users.forEach(function(user) {
        Markers.remove({user_id: user._id});
        MarkerGroups.remove({user_id: user._id});
        Meteor.users.remove(user._id);
      });
    };

    return w;
  };
}
