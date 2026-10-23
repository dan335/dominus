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
  dTest.waitForJobs = function(ms) {
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

  // opts.players: how many players (default 3)
  // opts.game: extra fields for the Games doc
  // Returns {gameId, users, players, castles, player(i), castle(i), cleanup()}.
  dTest.buildGameWorld = function(opts) {
    opts = opts || {};
    var count = opts.players || 3;
    var w = {users: [], players: [], castles: []};

    var game = dTest.helpers.createTestGame(_.extend({name: 'World ' + Random.id(4)}, opts.game || {}));
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
      _s.mapmaker.minHexesInCountry = 100;
      _s.mapmaker.maxHexesInCountry = 100;
      Mapmaker.addCountry(w.gameId, true);
      dManager.startGame(Games.findOne(w.gameId), true);
    } finally {
      _.extend(_s.mapmaker, sizes);
    }

    w.users.forEach(function(user) {
      var player = Players.findOne({gameId: w.gameId, userId: user._id});
      if (!player) throw new Error('FAIL: buildGameWorld could not create a player for ' + user.username);
      w.players.push(player);
      w.castles.push(Castles.findOne(player.castle_id));
    });

    // fresh copies, since methods change them
    w.player = function(i) { return Players.findOne(w.players[i]._id); };
    w.castle = function(i) { return Castles.findOne(w.castles[i]._id); };

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
