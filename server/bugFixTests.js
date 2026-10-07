// Regression tests for the "bugs found along the way" fixes (Oct 2026).
// They run as part of runGameCreationTests (server/gameCreationTests.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  _bugFixTests = function(run, t) {
    var assert = t.assert;
    var equal = t.equal;


    // --- Helpers ---

    // replace obj[key] and return a function that puts the original back
    function stub(obj, key, value) {
      var had = Object.prototype.hasOwnProperty.call(obj, key);
      var original = obj[key];
      obj[key] = value;
      return function() {
        if (had) {
          obj[key] = original;
        } else {
          delete obj[key];
        }
      };
    }

    // process.env coerces values to strings, so undefined has to be deleted
    function stubEnv(key, value) {
      var had = Object.prototype.hasOwnProperty.call(process.env, key);
      var original = process.env[key];
      process.env[key] = value;
      return function() {
        if (had) {
          process.env[key] = original;
        } else {
          delete process.env[key];
        }
      };
    }

    function restoreAll(restores) {
      restores.reverse().forEach(function(restore) { restore(); });
    }

    // poll for an observer-driven result
    function waitFor(fn, ms) {
      var end = Date.now() + (ms || 10000);
      while (Date.now() < end) {
        if (fn()) return true;
        Meteor._sleepForMs(100);
      }
      return !!fn();
    }

    function near(a, b, message) {
      var ok = Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
      if (!ok) throw new Error('FAIL: ' + message + ' (expected ' + b + ', got ' + a + ')');
    }

    function time(d) {
      return d ? new Date(d).getTime() : null;
    }

    // invoke a method handler as a given user, optionally as a client simulation
    function callAs(userId, method, args, simulate) {
      var inv = {userId: userId, isSimulation: !!simulate, connection: null, unblock: function() {}, setUserId: function() {}};
      return DDP._CurrentInvocation.withValue(inv, function() {
        return Meteor.server.method_handlers[method].apply(inv, args);
      });
    }

    // run a publication handler against a recording stub subscription
    function runPublication(name, userId, args) {
      var out = {ready: 0, docs: {}, cursor: null, error: null};
      var stops = [];
      var sub = {
        userId: userId,
        connection: {id: 'bugFixTests'},
        ready: function() { out.ready++; },
        added: function(collection, id, fields) {
          out.docs[collection] = out.docs[collection] || {};
          out.docs[collection][id] = fields;
        },
        changed: function() {},
        removed: function(collection, id) {
          if (out.docs[collection]) delete out.docs[collection][id];
        },
        onStop: function(fn) { stops.push(fn); },
        error: function(e) { out.error = e; },
        stop: function() {}
      };
      try {
        var result = Meteor.server.publish_handlers[name].apply(sub, args || []);
        if (result && typeof result._publishCursor === 'function') {
          // Meteor publishes a returned cursor and then marks the sub ready itself
          out.cursor = result;
          result._publishCursor(sub);
          out.ready++;
        }
      } finally {
        stops.forEach(function(fn) { fn(); });
      }
      return out;
    }

    function publishedIds(out, collection) {
      return Object.keys(out.docs[collection] || {}).sort();
    }

    function allPublishedIds(out) {
      var ids = [];
      _.each(out.docs, function(docs) { ids = ids.concat(Object.keys(docs)); });
      return ids.sort();
    }

    function sameIds(actual, expected, message) {
      equal(JSON.stringify(actual.slice().sort()), JSON.stringify(expected.slice().sort()), message);
    }


    // --- #1 Dailystats _id (dGraphs.dailystatsNumVassalsEveryone) ---

    run('dailystatsNumVassalsEveryone: a new row gets a string _id and the right fields', function() {
      let game = t.createTestGame({hasStarted: true, startedAt: new Date()});
      try {
        let userId = 'u_' + Random.id(5);
        let pid = Players.insert({gameId: game._id, userId: userId, num_allies_below: 3});

        dGraphs.dailystatsNumVassalsEveryone(game._id);

        let rows = Dailystats.find({playerId: pid}).fetch();
        equal(rows.length, 1, 'one row created');
        equal(typeof rows[0]._id, 'string', 'row _id is a string');
        equal(rows[0].gameId, game._id, 'gameId');
        equal(rows[0].user_id, userId, 'user_id');
        equal(rows[0].numVassals, 3, 'numVassals is num_allies_below');
      } finally {
        Dailystats.remove({gameId: game._id});
        t.cleanup(game._id);
      }
    });

    run('dailystatsNumVassalsEveryone: existing rows are updated in place, missing counts are 0', function() {
      let game = t.createTestGame({hasStarted: true, startedAt: new Date()});
      try {
        let withRow = Players.insert({gameId: game._id, userId: 'u_' + Random.id(5), num_allies_below: 2});
        let noCount = Players.insert({gameId: game._id, userId: 'u_' + Random.id(5)});
        let noRow = Players.insert({gameId: game._id, userId: 'u_' + Random.id(5), num_allies_below: 1});
        let rowId = Dailystats.insert({gameId: game._id, playerId: withRow, created_at: new Date(), numVassals: 0});

        dGraphs.dailystatsNumVassalsEveryone(game._id);

        let row = Dailystats.findOne({playerId: withRow});
        equal(row._id, rowId, 'existing row keeps its _id');
        equal(row.numVassals, 2, 'existing row updated');
        equal(Dailystats.find({playerId: noCount}).count(), 1, 'one row for player without a count');
        equal(Dailystats.findOne({playerId: noCount}).numVassals, 0, 'missing num_allies_below counts as 0');
        equal(Dailystats.find({playerId: noRow}).count(), 1, 'one row for player without a row');
        equal(Dailystats.find({playerId: withRow}).count(), 1, 'no duplicate row');
      } finally {
        Dailystats.remove({gameId: game._id});
        t.cleanup(game._id);
      }
    });

    run('dailystatsNumVassalsEveryone: a game with no players writes nothing', function() {
      let game = t.createTestGame({hasStarted: true, startedAt: new Date()});
      try {
        dGraphs.dailystatsNumVassalsEveryone(game._id);
        equal(Dailystats.find({gameId: game._id}).count(), 0, 'no rows');
      } finally {
        t.cleanup(game._id);
      }
    });


    // --- #2 num_vassals (dInit.updateVassalAllyCountMultiple) ---

    run('updateVassalAllyCountMultiple counts direct vassals and keeps the other counts', function() {
      let game = t.createTestGame({hasStarted: true, startedAt: new Date()});
      try {
        let a = Players.insert({gameId: game._id, userId: 'u_' + Random.id(5),
          vassals: ['x', 'y'], allies_above: ['p'], allies_below: ['x', 'y', 'z'], team: ['a', 'b', 'c', 'd']});
        let b = Players.insert({gameId: game._id, userId: 'u_' + Random.id(5),
          allies_above: [], allies_below: [], team: []});

        dInit.updateVassalAllyCountMultiple([a, b]);

        let pa = Players.findOne(a);
        equal(pa.num_vassals, 2, 'num_vassals counts direct vassals');
        equal(pa.num_allies_above, 1, 'num_allies_above');
        equal(pa.num_allies_below, 3, 'num_allies_below');
        equal(pa.num_team, 4, 'num_team');
        equal(Dailystats.findOne({playerId: a}).numVassals, 3, 'Dailystats numVassals is still allies_below');

        let pb = Players.findOne(b);
        equal(pb.num_vassals, 0, 'no vassals field counts as 0');
        equal(pb.num_allies_below, 0, 'empty allies_below');

        dInit.updateVassalAllyCountMultiple([]);
      } finally {
        Dailystats.remove({gameId: game._id});
        t.cleanup(game._id);
      }
    });

    run('updateVassalAllyCountMultiple matches a tree built by set_lord_and_vassal', function() {
      let game = t.createTestGame({hasStarted: true, startedAt: new Date()});
      let restores = [stub(Queues, 'add', function() { return true; })];
      try {
        let mk = function() {
          return Players.insert({gameId: game._id, userId: 'u_' + Random.id(5), username: 'p_' + Random.id(3),
            is_king: true, king: null, lord: null, vassals: [], allies_above: [], allies_below: [], team: []});
        };
        let lord = mk(), vassal = mk(), sub = mk();
        dInit.set_lord_and_vassal(lord, vassal);
        dInit.set_lord_and_vassal(vassal, sub);

        dInit.updateVassalAllyCountMultiple([lord, vassal, sub]);

        let l = Players.findOne(lord), v = Players.findOne(vassal), s = Players.findOne(sub);
        equal(l.num_vassals, 1, 'lord has one direct vassal');
        equal(l.num_allies_below, 2, 'lord has two below');
        equal(v.num_vassals, 1, 'vassal has one direct vassal');
        equal(v.num_allies_below, 1, 'vassal has one below');
        equal(s.num_vassals, 0, 'bottom player has no vassals');
      } finally {
        restoreAll(restores);
        Alerts.remove({gameId: game._id});
        GlobalAlerts.remove({gameId: game._id});
        Dailystats.remove({gameId: game._id});
        t.cleanup(game._id);
      }
    });


    // --- #3 Village income lord share (dIncome.collectVillageIncome) ---

    // one village at (vx, vy) owned by a vassal with numLords lords, surrounded by resource hexes
    function villageFixture(game, vx, vy, lordIds) {
      let ownerId = Players.insert({gameId: game._id, userId: 'u_' + Random.id(5), allies_above: lordIds});
      let i = 0;
      Hx.getSurroundingHexes(vx, vy, _s.villages.num_rings_village).forEach(function(h) {
        if (h.x == vx && h.y == vy) return;
        Hexes.insert({gameId: game._id, x: h.x, y: h.y, type: _s.market.types[i % _s.market.types.length], large: false});
        i++;
      });
      let villageId = Villages.insert({gameId: game._id, playerId: ownerId, x: vx, y: vy, level: 1,
        under_construction: false, lastIncomeUpdate: new Date(0)});
      return {ownerId: ownerId, villageId: villageId};
    }

    function makeLords(game, n) {
      return _.range(n).map(function() {
        return Players.insert({gameId: game._id, userId: 'u_' + Random.id(5), allies_above: []});
      });
    }

    function cleanVillageGame(game) {
      Villages.remove({gameId: game._id});
      t.cleanup(game._id);
    }

    [[1, 0.06], [5, 0.3 / 5], [6, 0.3 / 6]].forEach(function(c) {
      let numLords = c[0], pct = c[1];
      run('collectVillageIncome pays each of ' + numLords + ' lords ' + pct + ' of the village income', function() {
        Games.remove({}); Players.remove({}); Villages.remove({});
        let game = t.createTestGame({hasStarted: true, startedAt: new Date()});
        try {
          let lords = makeLords(game, numLords);
          let f = villageFixture(game, 0, 0, lords);

          dIncome.collectVillageIncome();

          let income = Villages.findOne(f.villageId).income;
          assert(income && income.grain > 0, 'village collected some income');
          let owner = Players.findOne(f.ownerId);
          _s.market.types_plus_gold.forEach(function(type) {
            near(owner.incomeFromVillages[type], income[type], 'owner incomeFromVillages.' + type);
            near(owner[type], income[type], 'owner ' + type);
          });
          lords.forEach(function(lordId) {
            let lord = Players.findOne(lordId);
            _s.market.types_plus_gold.forEach(function(type) {
              near(lord.incomeFromVassals[type], income[type] * pct, 'lord incomeFromVassals.' + type);
            });
          });
        } finally {
          cleanVillageGame(game);
        }
      });
    });

    run('collectVillageIncome: no lords pays only the owner, a shared lord gets the sum', function() {
      Games.remove({}); Players.remove({}); Villages.remove({});
      let game = t.createTestGame({hasStarted: true, startedAt: new Date()});
      try {
        let bystander = Players.insert({gameId: game._id, userId: 'u_' + Random.id(5), allies_above: []});
        let lone = villageFixture(game, 0, 0, []);
        let lords = makeLords(game, 1);
        let v1 = villageFixture(game, 10, 10, lords);
        let v2 = villageFixture(game, 20, 20, lords);

        dIncome.collectVillageIncome();

        let b = Players.findOne(bystander);
        assert(!b.incomeFromVassals && !b.incomeFromVillages, 'player without a village or vassals is untouched');
        assert(Players.findOne(lone.ownerId).incomeFromVillages.grain > 0, 'owner without lords is paid');

        let i1 = Villages.findOne(v1.villageId).income, i2 = Villages.findOne(v2.villageId).income;
        let lord = Players.findOne(lords[0]);
        _s.market.types_plus_gold.forEach(function(type) {
          near(lord.incomeFromVassals[type], (i1[type] + i2[type]) * 0.06, 'shared lord gets both shares of ' + type);
        });
      } finally {
        cleanVillageGame(game);
      }
    });

    run('collectVillageIncome skips villages under construction or recently paid', function() {
      Games.remove({}); Players.remove({}); Villages.remove({});
      let game = t.createTestGame({hasStarted: true, startedAt: new Date()});
      try {
        let lords = makeLords(game, 1);
        let building = villageFixture(game, 0, 0, lords);
        Villages.update(building.villageId, {$set: {under_construction: true}});
        let recent = villageFixture(game, 10, 10, lords);
        let recentDate = new Date();
        Villages.update(recent.villageId, {$set: {lastIncomeUpdate: recentDate}});

        dIncome.collectVillageIncome();

        assert(!Villages.findOne(building.villageId).income, 'village under construction not paid');
        equal(time(Villages.findOne(recent.villageId).lastIncomeUpdate), recentDate.getTime(), 'recent village not paid again');
        assert(!Players.findOne(lords[0]).incomeFromVassals, 'lord gets nothing');
        assert(!Players.findOne(building.ownerId).incomeFromVillages, 'owner gets nothing');
      } finally {
        cleanVillageGame(game);
      }
    });

    run('collectVillageIncome does not leak percentPerLord as a global', function() {
      Games.remove({}); Players.remove({}); Villages.remove({});
      let game = t.createTestGame({hasStarted: true, startedAt: new Date()});
      try {
        delete global.percentPerLord;
        villageFixture(game, 0, 0, makeLords(game, 1));
        dIncome.collectVillageIncome();
        equal(typeof global.percentPerLord, 'undefined', 'no global percentPerLord');
      } finally {
        delete global.percentPerLord;
        cleanVillageGame(game);
      }
    });


    // --- #4 Recentchats cleanup when a room is deleted ---

    function roomFixture(gameId, fields) {
      let roomId = Rooms.insert(_.extend({gameId: gameId, name: 'bf_' + Random.id(4), type: 'normal',
        members: [], owner: 'bf_owner', created_at: new Date()}, fields || {}));
      Recentchats.insert({room_id: roomId, gameId: gameId, updated_at: new Date()});
      return roomId;
    }

    run('deleting a room removes its recentchats on the worker (skipped unless DOMINUS_WORKER=true)', function() {
      if (process.env.DOMINUS_WORKER != 'true') return 'skip';
      let gameId = 'bf_' + Random.id();
      try {
        let gone = roomFixture(gameId), kept = roomFixture(gameId);
        Rooms.remove(gone);
        assert(waitFor(function() { return Recentchats.find({room_id: gone}).count() === 0; }),
          'recentchat of the deleted room is removed');
        equal(Recentchats.find({room_id: kept}).count(), 1, 'other room keeps its recentchat');
      } finally {
        Rooms.remove({gameId: gameId});
        Recentchats.remove({gameId: gameId});
      }
    });

    run('destroyKingChatroom removes the room recentchat on the worker (skipped unless DOMINUS_WORKER=true)', function() {
      if (process.env.DOMINUS_WORKER != 'true') return 'skip';
      let game = t.createTestGame({hasStarted: true});
      try {
        let king = Players.insert({gameId: game._id, userId: 'u_' + Random.id(5), is_king: true});
        let roomId = roomFixture(game._id, {type: 'king', owner: king, members: [king]});
        dChat.destroyKingChatroom(king);
        equal(Rooms.find(roomId).count(), 0, 'king room deleted');
        assert(waitFor(function() { return Recentchats.find({room_id: roomId}).count() === 0; }),
          'recentchat of the king room is removed');
      } finally {
        Rooms.remove({gameId: game._id});
        Recentchats.remove({gameId: game._id});
        Roomchats.remove({gameId: game._id});
        t.cleanup(game._id);
      }
    });

    run('starting a rooms observer never deletes recentchats of existing rooms', function() {
      // what the worker does on every deploy: observe() only calls removed for
      // rooms deleted after it starts
      let gameId = 'bf_' + Random.id();
      let handle = null;
      try {
        let rooms = [roomFixture(gameId), roomFixture(gameId), roomFixture(gameId)];
        handle = Rooms.find({gameId: gameId}, {fields: {_id: 1}}).observe({
          removed: function(room) { Recentchats.remove({room_id: room._id}); }
        });
        Meteor._sleepForMs(2000);
        equal(Recentchats.find({room_id: {$in: rooms}}).count(), 3, 'all recentchats still there');
      } finally {
        if (handle) handle.stop();
        Rooms.remove({gameId: gameId});
        Recentchats.remove({gameId: gameId});
      }
    });


    // --- #5 Settings cache ---

    run('settings cache follows a game from start to end and removal', function() {
      let ended = t.createTestGame({hasStarted: true, hasEnded: false, isSpeed: false});
      let removed = t.createTestGame({hasStarted: true, hasEnded: false});
      try {
        assert(waitFor(function() { return !!_gs._cachedGames[ended._id]; }), 'started game is cached');
        Games.update(ended._id, {$set: {isSpeed: true}});
        assert(waitFor(function() { return _gs._cachedGames[ended._id] && _gs._cachedGames[ended._id].isSpeed === true; }),
          'cache picks up a changed flag');

        Games.update(ended._id, {$set: {hasEnded: true}});
        assert(waitFor(function() { return !_gs._cachedGames[ended._id]; }), 'ended game leaves the cache');
        equal(_gs.getGame(ended._id).isSpeed, true, 'ended game settings still readable');

        assert(waitFor(function() { return !!_gs._cachedGames[removed._id]; }), 'second game is cached');
        Games.remove(removed._id);
        assert(waitFor(function() { return !_gs._cachedGames[removed._id]; }), 'removed game leaves the cache');
      } finally {
        t.cleanup(ended._id);
        t.cleanup(removed._id);
      }
    });

    run('every _gs setting is identical whether the game is cached or not, for all flag combinations', function() {
      let flags = ['isRelaxed', 'isSpeed', 'isCrazyFast', 'isNoLargeResources'];
      let names = Object.keys(_gs).filter(function(name) {
        return typeof _gs[name] === 'function' && name !== 'getGame' && _s[name] && typeof _s[name] === 'object';
      });
      assert(names.length >= 9, 'found the settings functions (' + names.join(',') + ')');

      let snapshot = function(gameId) {
        let out = {};
        names.forEach(function(name) {
          Object.keys(_s[name]).forEach(function(key) {
            out[name + '.' + key] = JSON.stringify(_gs[name](gameId, key));
          });
        });
        return out;
      };

      let games = _.range(16).map(function(n) {
        let overrides = {hasStarted: true, hasEnded: false};
        flags.forEach(function(flag, i) { overrides[flag] = !!(n & (1 << i)); });
        return t.createTestGame(overrides);
      });
      try {
        assert(waitFor(function() { return games.every(function(g) { return !!_gs._cachedGames[g._id]; }); }),
          'all games cached');
        let cached = games.map(function(g) { return snapshot(g._id); });

        games.forEach(function(g) { Games.update(g._id, {$set: {hasEnded: true}}); });
        assert(waitFor(function() { return games.every(function(g) { return !_gs._cachedGames[g._id]; }); }),
          'all games left the cache');
        let uncached = games.map(function(g) { return snapshot(g._id); });

        games.forEach(function(g, i) {
          _.each(cached[i], function(value, key) {
            equal(uncached[i][key], value, 'game ' + i + ' ' + key);
          });
        });
      } finally {
        games.forEach(function(g) { t.cleanup(g._id); });
      }
    });

    run('uncached getGame reads only the settings fields, and unknown ids give {}', function() {
      let game = t.createTestGame({hasStarted: false, isSpeed: true, tree: {big: true}, minimap: {big: true}});
      try {
        let g = _gs.getGame(game._id);
        equal(g.isSpeed, true, 'flag read');
        assert(!('tree' in g), 'tree not loaded');
        assert(!('minimap' in g), 'minimap not loaded');
        equal(JSON.stringify(_gs.getGame('bf_missing_' + Random.id())), '{}', 'unknown id');
        equal(JSON.stringify(_gs.getGame(undefined)), '{}', 'no id');
      } finally {
        t.cleanup(game._id);
      }
    });


    // --- #6 Mapbaker bakeCountry job ---

    function bakeData() {
      return {
        imageObject: {filename: 'bf_country', countryId: 'bf_c', hasCoords: false},
        imageObjectWithCoords: {filename: 'bf_country_withcoords', countryId: 'bf_c', hasCoords: true}
      };
    }

    // runs the job with every side effect stubbed and returns what it tried to do
    function runBakeJob(opts) {
      let calls = {chmod: [], jpg: [], s3: [], queued: [], result: null};
      let restores = [
        stub(Mapbaker, 'bakeCountry', function() { return opts.data; }),
        stub(Mapbaker, 'fs', {
          existsSync: function() { return !!opts.svgExists; },
          chmodSync: function(f) { calls.chmod.push(f); }
        }),
        stub(Mapbaker, 'createJpgImage', function(inFile, outFile) { calls.jpg.push(outFile); return opts.jpgOk ? outFile : false; }),
        stub(Mapbaker, 'uploadToS3', function(file) { calls.s3.push(file); return opts.s3Ok ? 'https://bf/' + file : false; }),
        stub(Queues, 'add', function(name, data) { calls.queued.push({name: name, data: data}); return true; }),
        stub(Meteor.settings.public.s3, 'serveBakesFromS3', !!opts.s3),
        stubEnv('DOMINUS_TEST', 'false')
      ];
      try {
        calls.result = Mapbaker.processBakeCountryJob({data: {countryId: 'bf_c'}});
      } finally {
        restoreAll(restores);
      }
      return calls;
    }

    run('bakeCountry job: no data from bakeCountry resolves and does nothing else', function() {
      let c = runBakeJob({data: false});
      assert(c.result && typeof c.result.then === 'function', 'returns a promise');
      equal(c.chmod.length, 0, 'no chmod');
      equal(c.jpg.length, 0, 'no jpg');
      equal(c.queued.length, 0, 'no finishImage');
    });

    run('bakeCountry job: missing svg resolves and does nothing else', function() {
      let c = runBakeJob({data: bakeData(), svgExists: false});
      assert(c.result && typeof c.result.then === 'function', 'returns a promise');
      equal(c.chmod.length, 0, 'no chmod');
      equal(c.jpg.length, 0, 'no jpg');
      equal(c.queued.length, 0, 'no finishImage');
    });

    run('bakeCountry job: failed jpg resolves without uploading or finishing', function() {
      let c = runBakeJob({data: bakeData(), svgExists: true, jpgOk: false, s3: true, s3Ok: true});
      assert(c.result && typeof c.result.then === 'function', 'returns a promise');
      equal(c.chmod.length, 2, 'both svgs chmodded');
      equal(c.s3.length, 0, 'no upload');
      equal(c.queued.length, 0, 'no finishImage');
    });

    run('bakeCountry job: happy path queues finishImage for both images', function() {
      [{s3: false}, {s3: true, s3Ok: true}, {s3: true, s3Ok: false}].forEach(function(o) {
        let c = runBakeJob(_.extend({data: bakeData(), svgExists: true, jpgOk: true}, o));
        let label = ' (s3 ' + o.s3 + ', upload ok ' + o.s3Ok + ')';
        assert(c.result && typeof c.result.then === 'function', 'returns a promise' + label);
        equal(c.chmod.length, 2, 'both svgs chmodded' + label);
        equal(c.jpg.length, 2, 'two jpgs' + label);
        equal(c.s3.length, o.s3 ? 2 : 0, 'uploads' + label);
        equal(c.queued.length, 2, 'two finishImage jobs' + label);
        equal(c.queued[0].name, 'finishImage', 'job name' + label);
        equal(c.queued[0].data.imageObject.hasCoords, false, 'plain image first' + label);
        equal(c.queued[1].data.imageObject.hasCoords, true, 'image with coords second' + label);
      });
    });


    // --- #7 forumTopics publication ---

    run('forumTopics pastMonth filter works and the other filters are unchanged', function() {
      let user = t.createTestUser({verifiedEmail: true});
      let unverified = t.createTestUser({verifiedEmail: false});
      let banned = t.createTestUser({verifiedEmail: true, banned: true});
      let cat1 = 'bf_cat_' + Random.id(), cat2 = 'bf_cat_' + Random.id();
      let monthsAgo = moment().subtract(2, 'months').toDate();
      let topic = function(fields) {
        return Forumtopics.insert(_.extend({title: 't', numPosts: 1, numViews: 0, createdAt: new Date(),
          updatedAt: new Date(), lastPostDate: new Date()}, fields));
      };
      let recent = topic({categoryId: cat1});
      let old = topic({categoryId: cat1, updatedAt: monthsAgo, createdAt: monthsAgo});
      let pinned = topic({categoryId: cat1, isPinned: true});
      let other = topic({categoryId: cat2});
      let ours = [recent, old, pinned, other];
      let ids = function(out) { return _.intersection(allPublishedIds(out), ours); };
      try {
        let month = runPublication('forumTopics', user._id, ['post', 50, 'all', 'pastMonth']);
        sameIds(ids(month), [recent, other], 'pastMonth: only recent, unpinned topics');
        let cutoff = month.cursor._cursorDescription.selector.updatedAt.$gte;
        assert(Math.abs(cutoff.getTime() - moment().subtract(1, 'months').valueOf()) < 60000, 'cutoff is one month ago');

        sameIds(ids(runPublication('forumTopics', user._id, ['post', 50, 'all', 'all'])), [recent, old, other], 'all: every unpinned topic');
        sameIds(ids(runPublication('forumTopics', user._id, ['post', 50, cat1, 'pastMonth'])), [recent], 'pastMonth + category');
        sameIds(ids(runPublication('forumTopics', user._id, ['post', 50, cat1, 'all'])), [recent, old], 'category only');
        equal(publishedIds(runPublication('forumTopics', user._id, ['topic', 1, cat1, 'all']), 'forumtopics').length, 1, 'numShow limit');

        [null, unverified._id, banned._id].forEach(function(userId) {
          let out = runPublication('forumTopics', userId, ['post', 50, 'all', 'pastMonth']);
          equal(out.ready, 1, 'ready for ' + userId);
          equal(allPublishedIds(out).length, 0, 'nothing published for ' + userId);
        });
      } finally {
        Forumtopics.remove({_id: {$in: ours}});
        [user, unverified, banned].forEach(function(u) { t.cleanupUser(u._id); });
      }
    });


    // --- #8a room_list publication ---

    run('room_list: bad arguments give an empty ready subscription, good ones the player rooms', function() {
      let gameId = 'bf_' + Random.id();
      let p1 = 'bf_p_' + Random.id(), p2 = 'bf_p_' + Random.id(), p3 = 'bf_p_' + Random.id();
      let r1 = Rooms.insert({gameId: gameId, members: [p1, p2], type: 'normal', name: 'a'});
      let r2 = Rooms.insert({gameId: gameId, members: [p2], type: 'normal', name: 'b'});
      let r3 = Rooms.insert({gameId: gameId, members: [p3], type: 'normal', name: 'c'});
      try {
        [[], [gameId], [gameId, {$exists: true}], [gameId, 5], [{$ne: null}, p2]].forEach(function(args) {
          let out = runPublication('room_list', 'bf_user', args);
          equal(out.ready, 1, 'ready once for ' + JSON.stringify(args));
          equal(allPublishedIds(out).length, 0, 'nothing published for ' + JSON.stringify(args));
        });

        let out = runPublication('room_list', 'bf_user', [gameId, p2]);
        equal(out.ready, 1, 'ready once');
        sameIds(publishedIds(out, 'room_list'), [r1, r2], 'rooms the player is in');
        equal(Object.keys(out.docs.room_list[r1]).length, 0, 'only _id published');
        assert(publishedIds(out, 'room_list').indexOf(r3) === -1, 'no other rooms');
      } finally {
        Rooms.remove({gameId: gameId});
      }
    });


    // --- #8b rightPanelTree publication ---

    run('rightPanelTree publishes the lords and is always ready', function() {
      let game = t.createTestGame({hasStarted: true});
      try {
        let lordFields = function(n) {
          return {gameId: game._id, userId: 'u_' + Random.id(5), name: 'lord' + n, username: 'lord' + n,
            x: n, y: n, castle_id: 'c' + n, lord: null, income: 999};
        };
        let l1 = Players.insert(lordFields(1)), l2 = Players.insert(lordFields(2));
        let unrelated = Players.insert(lordFields(3));
        let player = Players.insert({gameId: game._id, userId: 'u_' + Random.id(5), allies_above: [l1, l2]});
        let noAllies = Players.insert({gameId: game._id, userId: 'u_' + Random.id(5)});

        let out = runPublication('rightPanelTree', 'bf_user', [player]);
        equal(out.ready, 1, 'ready once');
        sameIds(publishedIds(out, 'right_panel_tree_players'), [l1, l2], 'exactly the lords');
        assert(publishedIds(out, 'right_panel_tree_players').indexOf(unrelated) === -1, 'no other players');
        _.each(out.docs.right_panel_tree_players, function(fields) {
          assert(_.difference(Object.keys(fields), ['name', 'x', 'y', 'castle_id', 'lord', 'username']).length === 0,
            'only the tree fields are published');
        });

        [[noAllies, 'bf_user'], ['bf_missing_' + Random.id(), 'bf_user'], [player, null]].forEach(function(c) {
          let o = runPublication('rightPanelTree', c[1], [c[0]]);
          equal(o.ready, 1, 'ready once for ' + c[0] + ' as ' + c[1]);
          equal(allPublishedIds(o).length, 0, 'nothing published for ' + c[0] + ' as ' + c[1]);
        });
      } finally {
        t.cleanup(game._id);
      }
    });


    // --- #9 Waypoint reordering (decreasePathIndex / increasePathIndex) ---

    // paths for one army; times are ms ago for last_move_at, null for none
    function insertPaths(gameId, userId, armyId, times, extra) {
      return times.map(function(ago, index) {
        return Armypaths.insert(_.extend({
          gameId: gameId, armyId: armyId, user_id: userId, index: index,
          x: index + 1, y: armyId.length + index, paused: false, speed: 10,
          hexes: [{x: 0, y: 0, countryId: 'bf'}], countryIds: ['bf'], distance: 1, time: 1000, dirtyMoveTotals: false,
          last_move_at: ago === null ? null : new Date(Date.now() - ago),
          createdAt: new Date()
        }, extra || {}));
      });
    }

    function armyState(armyId) {
      return Armypaths.find({armyId: armyId}, {sort: {index: 1}}).fetch().map(function(p) {
        return {_id: p._id, index: p.index, x: p.x, y: p.y, last_move_at: time(p.last_move_at)};
      });
    }

    var HOURS_3 = 3 * 60 * 60 * 1000, MINUTE = 60 * 1000;

    [['the same game', false], ['another game', true]].forEach(function(c) {
      run('decreasePathIndex keeps the army own move time when another army is in ' + c[0], function() {
        let userId = 'bf_u_' + Random.id();
        let gameB = 'bf_g_' + Random.id(), gameA = c[1] ? 'bf_g_' + Random.id() : gameB;
        let armyA = 'bf_a_' + Random.id(), armyB = 'bf_b_' + Random.id();
        try {
          // A is inserted first so a lookup without armyId finds A's path
          insertPaths(gameA, userId, armyA, [HOURS_3, HOURS_3]);
          let aBefore = Armypaths.find({armyId: armyA}).fetch();
          let b = insertPaths(gameB, userId, armyB, [MINUTE, MINUTE]);
          let bTime = time(Armypaths.findOne(b[0]).last_move_at);

          callAs(userId, 'decreasePathIndex', [b[1]]);

          let moved = Armypaths.findOne(b[1]);
          equal(moved.index, 0, 'waypoint moved to the front');
          equal(time(moved.last_move_at), bTime, 'it keeps army B own last_move_at');
          equal(Armypaths.findOne(b[0]).index, 1, 'old first waypoint is now second');
          equal(EJSON.stringify(Armypaths.find({armyId: armyA}).fetch()), EJSON.stringify(aBefore), 'army A paths untouched');
        } finally {
          Armypaths.remove({user_id: userId});
        }
      });
    });

    run('decreasePathIndex: the reordered army does not step early in moveArmiesJob', function() {
      Armypaths.remove({});
      let userId = 'bf_u_' + Random.id(), gameId = 'bf_g_' + Random.id();
      let armyA = 'bf_a_' + Random.id(), armyB = 'bf_b_' + Random.id();
      let restores = [stub(Queues, 'add', function() { return true; })];
      try {
        // A is idle (no hexes) with an old move time, B moved a minute ago
        insertPaths(gameId, userId, armyA, [HOURS_3], {hexes: null});
        let b = insertPaths(gameId, userId, armyB, [MINUTE, MINUTE]);
        Armies.insert({_id: armyB, gameId: gameId, user_id: userId, playerId: 'bf_p', x: 0, y: 0,
          last_move_at: new Date(Date.now() - MINUTE), moveDistance: 1});

        callAs(userId, 'decreasePathIndex', [b[1]]);
        // pathfinding would normally refill these
        Armypaths.update(b[1], {$set: {hexes: [{x: 7, y: 7, countryId: 'bf'}], speed: 10}});

        dArmies.moveArmiesJob();

        let army = Armies.findOne(armyB);
        equal(army.x, 0, 'army has not moved (x)');
        equal(army.y, 0, 'army has not moved (y)');
        equal(Armypaths.findOne(b[1]).hexes.length, 1, 'path not advanced');
      } finally {
        restoreAll(restores);
        Armypaths.remove({user_id: userId});
        Armies.remove({user_id: userId});
        Markers.remove({unitId: armyB});
      }
    });

    run('decreasePathIndex on a single army behaves as before', function() {
      let userId = 'bf_u_' + Random.id(), gameId = 'bf_g_' + Random.id(), army = 'bf_a_' + Random.id();
      try {
        let p = insertPaths(gameId, userId, army, [MINUTE, MINUTE, MINUTE, MINUTE, MINUTE, MINUTE]);
        let firstTime = time(Armypaths.findOne(p[0]).last_move_at);

        // 1 -> 0 takes the first waypoint's time
        callAs(userId, 'decreasePathIndex', [p[1]]);
        let s = armyState(army);
        equal(s.map(function(x) { return x._id; }).join(), [p[1], p[0], p[2], p[3], p[4], p[5]].join(), 'order after 1 -> 0');
        equal(s[0].last_move_at, firstTime, 'new first waypoint has the old first time');
        // re-path window is index -2..2 (path.index-3 .. path.index+1)
        [p[1], p[0], p[2]].forEach(function(id) {
          equal(Armypaths.findOne(id).hexes, null, 'waypoint in the re-path window is cleared');
        });
        [p[3], p[4], p[5]].forEach(function(id) {
          assert(Armypaths.findOne(id).hexes !== null, 'waypoint outside the re-path window keeps its hexes');
        });

        // 4 -> 3 clears last_move_at on the moved waypoint, as it always has
        callAs(userId, 'decreasePathIndex', [p[4]]);
        s = armyState(army);
        equal(s.map(function(x) { return x._id; }).join(), [p[1], p[0], p[2], p[4], p[3], p[5]].join(), 'order after 4 -> 3');
        equal(Armypaths.findOne(p[4]).last_move_at, null, 'moved waypoint last_move_at is null');

        [p[4], p[3], p[5]].forEach(function(id) {
          equal(Armypaths.findOne(id).hexes, null, 'waypoint in the second re-path window is cleared');
        });

        // index 0 is a no-op
        let before = EJSON.stringify(armyState(army));
        callAs(userId, 'decreasePathIndex', [p[1]]);
        equal(EJSON.stringify(armyState(army)), before, 'index 0 does nothing');

        // someone else's waypoint throws
        let threw = false;
        try { callAs('bf_other_' + Random.id(), 'decreasePathIndex', [p[2]]); } catch (e) { threw = true; }
        assert(threw, 'other user cannot reorder');
        equal(EJSON.stringify(armyState(army)), before, 'nothing changed');
      } finally {
        Armypaths.remove({user_id: userId});
      }
    });

    run('decreasePathIndex with no first waypoint for the army changes nothing', function() {
      let userId = 'bf_u_' + Random.id(), gameId = 'bf_g_' + Random.id();
      let armyA = 'bf_a_' + Random.id(), armyB = 'bf_b_' + Random.id();
      try {
        insertPaths(gameId, userId, armyA, [HOURS_3]);
        // B's only waypoint sits at index 1 (broken indexes)
        let b = Armypaths.insert({gameId: gameId, armyId: armyB, user_id: userId, index: 1, x: 9, y: 9,
          paused: false, speed: 10, hexes: null, countryIds: null, last_move_at: new Date(Date.now() - MINUTE)});
        let before = EJSON.stringify(Armypaths.find({user_id: userId}, {sort: {_id: 1}}).fetch());

        callAs(userId, 'decreasePathIndex', [b]);

        equal(EJSON.stringify(Armypaths.find({user_id: userId}, {sort: {_id: 1}}).fetch()), before, 'nothing changed');
      } finally {
        Armypaths.remove({user_id: userId});
      }
    });

    run('increasePathIndex behaves as before', function() {
      let userId = 'bf_u_' + Random.id(), gameId = 'bf_g_' + Random.id(), army = 'bf_a_' + Random.id();
      try {
        let p = insertPaths(gameId, userId, army, [MINUTE, 2 * MINUTE, 3 * MINUTE]);
        let firstTime = time(Armypaths.findOne(p[0]).last_move_at);
        callAs(userId, 'increasePathIndex', [p[0]]);
        let s = armyState(army);
        equal(s.map(function(x) { return x._id; }).join(), [p[1], p[0], p[2]].join(), 'order after 0 -> 1');
        equal(s[0].last_move_at, firstTime, 'new first waypoint takes the old first time');

        let before = EJSON.stringify(armyState(army));
        callAs(userId, 'increasePathIndex', [p[2]]);
        equal(EJSON.stringify(armyState(army)), before, 'last waypoint does nothing');
      } finally {
        Armypaths.remove({user_id: userId});
      }
    });

    run('client simulation of waypoint reordering ends in the same order as the server', function() {
      let userId = 'bf_u_' + Random.id(), gameId = 'bf_g_' + Random.id();
      let server = 'bf_s_' + Random.id(), sim = 'bf_m_' + Random.id();
      try {
        let ps = insertPaths(gameId, userId, server, [MINUTE, MINUTE, MINUTE, MINUTE]);
        let pm = insertPaths(gameId, userId, sim, [MINUTE, MINUTE, MINUTE, MINUTE]);
        // same steps on both armies: by position in the original list
        let steps = [['decreasePathIndex', 2], ['increasePathIndex', 0], ['decreasePathIndex', 1], ['increasePathIndex', 3]];
        let positions = function(army, ids) {
          return armyState(army).map(function(p) { return p.index + ':' + ids.indexOf(p._id); }).join();
        };
        steps.forEach(function(step) {
          callAs(userId, step[0], [ps[step[1]]], false);
          callAs(userId, step[0], [pm[step[1]]], true);
          equal(positions(sim, pm), positions(server, ps), 'same order after ' + step[0] + ' ' + step[1]);
        });
      } finally {
        Armypaths.remove({user_id: userId});
      }
    });
  };
}
