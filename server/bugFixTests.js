// Regression tests for the "bugs found along the way" fixes (Oct 2026).
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  _bugFixTests = async function(run, t) {
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
    async function waitFor(fn, ms) {
      var end = Date.now() + (ms || 10000);
      while (Date.now() < end) {
        if (await fn()) return true;
        await dTest.sleep(100);
      }
      return !!(await fn());
    }

    function near(a, b, message) {
      var ok = Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
      if (!ok) throw new Error('FAIL: ' + message + ' (expected ' + b + ', got ' + a + ')');
    }

    function time(d) {
      return d ? new Date(d).getTime() : null;
    }

    // invoke a method handler as a given user, optionally as a client simulation
    async function callAs(userId, method, args, simulate) {
      var inv = {userId: userId, isSimulation: !!simulate, connection: null, unblock: function() {}, setUserId: function() {}};
      return await DDP._CurrentInvocation.withValue(inv, async function() {
        return await Meteor.server.method_handlers[method].apply(inv, args);
      });
    }

    // run a publication handler against a recording stub subscription
    async function runPublication(name, userId, args) {
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
        var result = await Meteor.server.publish_handlers[name].apply(sub, args || []);
        if (result && typeof result._publishCursor === 'function') {
          // Meteor publishes a returned cursor and then marks the sub ready itself
          out.cursor = result;
          await result._publishCursor(sub);
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

    await run('dailystatsNumVassalsEveryone: a new row gets a string _id and the right fields', async function() {
      let game = await t.createTestGame({hasStarted: true, startedAt: new Date()});
      try {
        let userId = 'u_' + Random.id(5);
        let pid = await Players.insertAsync({gameId: game._id, userId: userId, num_allies_below: 3});

        await dGraphs.dailystatsNumVassalsEveryone(game._id);

        let rows = await Dailystats.find({playerId: pid}).fetchAsync();
        equal(rows.length, 1, 'one row created');
        equal(typeof rows[0]._id, 'string', 'row _id is a string');
        equal(rows[0].gameId, game._id, 'gameId');
        equal(rows[0].user_id, userId, 'user_id');
        equal(rows[0].numVassals, 3, 'numVassals is num_allies_below');
      } finally {
        await Dailystats.removeAsync({gameId: game._id});
        await t.cleanup(game._id);
      }
    });

    await run('dailystatsNumVassalsEveryone: existing rows are updated in place, missing counts are 0', async function() {
      let game = await t.createTestGame({hasStarted: true, startedAt: new Date()});
      try {
        let withRow = await Players.insertAsync({gameId: game._id, userId: 'u_' + Random.id(5), num_allies_below: 2});
        let noCount = await Players.insertAsync({gameId: game._id, userId: 'u_' + Random.id(5)});
        let noRow = await Players.insertAsync({gameId: game._id, userId: 'u_' + Random.id(5), num_allies_below: 1});
        let rowId = await Dailystats.insertAsync({gameId: game._id, playerId: withRow, created_at: new Date(), numVassals: 0});

        await dGraphs.dailystatsNumVassalsEveryone(game._id);

        let row = await Dailystats.findOneAsync({playerId: withRow});
        equal(row._id, rowId, 'existing row keeps its _id');
        equal(row.numVassals, 2, 'existing row updated');
        equal(await Dailystats.find({playerId: noCount}).countAsync(), 1, 'one row for player without a count');
        equal((await Dailystats.findOneAsync({playerId: noCount})).numVassals, 0, 'missing num_allies_below counts as 0');
        equal(await Dailystats.find({playerId: noRow}).countAsync(), 1, 'one row for player without a row');
        equal(await Dailystats.find({playerId: withRow}).countAsync(), 1, 'no duplicate row');
      } finally {
        await Dailystats.removeAsync({gameId: game._id});
        await t.cleanup(game._id);
      }
    });

    await run('dailystatsNumVassalsEveryone: a game with no players writes nothing', async function() {
      let game = await t.createTestGame({hasStarted: true, startedAt: new Date()});
      try {
        await dGraphs.dailystatsNumVassalsEveryone(game._id);
        equal(await Dailystats.find({gameId: game._id}).countAsync(), 0, 'no rows');
      } finally {
        await t.cleanup(game._id);
      }
    });


    // --- #2 num_vassals (dInit.updateVassalAllyCountMultiple) ---

    await run('updateVassalAllyCountMultiple counts direct vassals and keeps the other counts', async function() {
      let game = await t.createTestGame({hasStarted: true, startedAt: new Date()});
      try {
        let a = await Players.insertAsync({gameId: game._id, userId: 'u_' + Random.id(5),
          vassals: ['x', 'y'], allies_above: ['p'], allies_below: ['x', 'y', 'z'], team: ['a', 'b', 'c', 'd']});
        let b = await Players.insertAsync({gameId: game._id, userId: 'u_' + Random.id(5),
          allies_above: [], allies_below: [], team: []});

        await dInit.updateVassalAllyCountMultiple([a, b]);

        let pa = await Players.findOneAsync(a);
        equal(pa.num_vassals, 2, 'num_vassals counts direct vassals');
        equal(pa.num_allies_above, 1, 'num_allies_above');
        equal(pa.num_allies_below, 3, 'num_allies_below');
        equal(pa.num_team, 4, 'num_team');
        equal((await Dailystats.findOneAsync({playerId: a})).numVassals, 3, 'Dailystats numVassals is still allies_below');

        let pb = await Players.findOneAsync(b);
        equal(pb.num_vassals, 0, 'no vassals field counts as 0');
        equal(pb.num_allies_below, 0, 'empty allies_below');

        await dInit.updateVassalAllyCountMultiple([]);
      } finally {
        await Dailystats.removeAsync({gameId: game._id});
        await t.cleanup(game._id);
      }
    });

    await run('updateVassalAllyCountMultiple matches a tree built by set_lord_and_vassal', async function() {
      let game = await t.createTestGame({hasStarted: true, startedAt: new Date()});
      let restores = [stub(Queues, 'addAsync', async function() { return true; })];
      try {
        let mk = async function() {
          return await Players.insertAsync({gameId: game._id, userId: 'u_' + Random.id(5), username: 'p_' + Random.id(3),
            is_king: true, king: null, lord: null, vassals: [], allies_above: [], allies_below: [], team: []});
        };
        let lord = await mk(), vassal = await mk(), sub = await mk();
        await dInit.set_lord_and_vassal(lord, vassal);
        await dInit.set_lord_and_vassal(vassal, sub);

        await dInit.updateVassalAllyCountMultiple([lord, vassal, sub]);

        let l = await Players.findOneAsync(lord), v = await Players.findOneAsync(vassal), s = await Players.findOneAsync(sub);
        equal(l.num_vassals, 1, 'lord has one direct vassal');
        equal(l.num_allies_below, 2, 'lord has two below');
        equal(v.num_vassals, 1, 'vassal has one direct vassal');
        equal(v.num_allies_below, 1, 'vassal has one below');
        equal(s.num_vassals, 0, 'bottom player has no vassals');
      } finally {
        restoreAll(restores);
        await Alerts.removeAsync({gameId: game._id});
        await GlobalAlerts.removeAsync({gameId: game._id});
        await Dailystats.removeAsync({gameId: game._id});
        await t.cleanup(game._id);
      }
    });


    // Random conquests through set_lord_and_vassal, with each queued
    // updateVassalAllyCountMultiple run straight away the way the worker would.
    // After every conquest the lists must agree with each other and the counts
    // with the lists. A failure names the seed and the conquests that led to it.
    // The 2.16 soak found num_allies_below drifting: remove_lord_and_vassal
    // didn't read the team fields it recounted, and neither function recounted
    // the players above the lord or below the vassal.
    // The nightly rebuild (relation_finder) works the tree out again from each
    // player's lord. After any run of conquests it should find what the
    // conquests left. Both became async in upgrade PR 12.
    await run('random conquests: the nightly rebuild finds the tree the conquests left', async function() {
      let game = await t.createTestGame({hasStarted: true, startedAt: new Date()});
      let restores = [stub(Queues, 'addAsync', async function() { return true; })];
      let first = null;
      let sorted = function(list) { return JSON.stringify(_.sortBy(list || [], _.identity)); };
      try {
        for (let seed = 1; seed <= 60 && !first; seed++) {
          let r = seed;
          let rand = function(n) { r = (r * 1103515245 + 12345) % 2147483648; return r % n; };
          let ids = await dTest.mapAsync(_.range(6), async function(i) {
            return await Players.insertAsync({gameId: game._id, userId: 'u_' + Random.id(5), username: 'p' + i,
              is_king: true, king: null, lord: null, vassals: [], allies_above: [], allies_below: [], team: []});
          });
          let name = function(id) { return 'p' + ids.indexOf(id); };
          let tree = async function() {
            return (await Players.find({_id: {$in: ids}}, {sort: {username: 1}}).mapAsync(function(p) {
              // a king's own king field is left as it was by a conquest (null, or itself)
              return [p.username, p.lord ? name(p.lord) : null, p.is_king, p.is_king ? null : name(p.king),
                sorted(_.map(p.vassals, name)), sorted(_.map(p.allies_above, name)), sorted(_.map(p.allies_below, name))].join(' ');
            })).join('\n');
          };
          let steps = [];
          for (let step = 0; step < 15; step++) {
            let w = ids[rand(ids.length)], l = ids[rand(ids.length)];
            if (w == l || _.contains((await Players.findOneAsync(w)).allies_below, l)) continue;
            steps.push(name(w) + '>' + name(l));
            await dInit.set_lord_and_vassal(w, l);
          }
          let afterConquests = await tree();
          // scramble everything but the lords, so the rebuild has to work it out
          await Players.updateAsync({_id: {$in: ids}}, {$set: {is_king: false, king: null, vassals: [], allies_above: ['x'], allies_below: ['y'], team: []}}, {multi: true});
          await Players.updateAsync({_id: {$in: ids}, lord: null}, {$set: {is_king: true}}, {multi: true});
          await dInit.rebuildRelationships(game._id);
          let rebuilt = await tree();
          if (rebuilt != afterConquests) {
            first = 'seed ' + seed + ', after ' + steps.join(' ') + ':\n' + afterConquests + '\nrebuilt:\n' + rebuilt;
          }
          await Players.removeAsync({_id: {$in: ids}});
        }
        equal(first, null, 'the same tree');
      } finally {
        restoreAll(restores);
        await Alerts.removeAsync({gameId: game._id});
        await GlobalAlerts.removeAsync({gameId: game._id});
        await t.cleanup(game._id);
      }
    });

    await run('random conquests keep the relationship lists and their counts in step', async function() {
      let game = await t.createTestGame({hasStarted: true, startedAt: new Date()});
      let queued = [];
      let restores = [stub(Queues, 'addAsync', async function(name, data) {
        if (name == 'updateVassalAllyCountMultiple') queued.push(data.playerIds);
        return true;
      })];
      let first = {};  // kind of problem -> the first time it happened
      try {
        for (let seed = 1; seed <= 200; seed++) {
          let r = seed;
          let rand = function(n) { r = (r * 1103515245 + 12345) % 2147483648; return r % n; };
          let ids = await dTest.mapAsync(_.range(6), async function(i) {
            return await Players.insertAsync({gameId: game._id, userId: 'u_' + Random.id(5), username: 'p' + i,
              is_king: true, king: null, lord: null, vassals: [], allies_above: [], allies_below: [], team: []});
          });
          let name = function(id) { return 'p' + ids.indexOf(id); };
          let steps = [];
          for (let step = 0; step < 25; step++) {
            let w = ids[rand(ids.length)], l = ids[rand(ids.length)];
            let winner = await Players.findOneAsync(w);
            // you can't attack yourself or your own vassals
            if (w == l || _.contains(winner.allies_below, l)) continue;
            steps.push(name(w) + '>' + name(l));
            queued = [];
            await dInit.set_lord_and_vassal(w, l);
            await dTest.eachAsync(queued, async function(playerIds) { await dInit.updateVassalAllyCountMultiple(playerIds); });

            let problems = [];
            let players = await Players.find({_id: {$in: ids}}).fetchAsync();
            players.forEach(function(p) {
              let above = players.filter(function(o) { return _.contains(o.allies_below, p._id); }).map(function(o) { return o._id; });
              if (_.difference(above, p.allies_above).length || _.difference(p.allies_above, above).length) {
                problems.push(['lists', name(p._id) + ' allies_above does not match the allies_below lists']);
              }
              [['num_allies_below', 'allies_below'], ['num_allies_above', 'allies_above'], ['num_vassals', 'vassals'], ['num_team', 'team']].forEach(function(f) {
                if ((p[f[0]] || 0) != (p[f[1]] || []).length) {
                  problems.push([f[0], name(p._id) + ' ' + f[0] + ' is ' + p[f[0]] + ', the list has ' + (p[f[1]] || []).length]);
                }
              });
            });
            problems.forEach(function(pr) {
              first[pr[0]] = first[pr[0]] || 'seed ' + seed + ', after ' + steps.join(' ') + ': ' + pr[1];
            });
          }
          await Players.removeAsync({_id: {$in: ids}});
        }
        equal(_.map(first, function(v, k) { return k + ': ' + v; }).join('; '), '', 'no problems');
      } finally {
        restoreAll(restores);
        await Alerts.removeAsync({gameId: game._id});
        await GlobalAlerts.removeAsync({gameId: game._id});
        await Dailystats.removeAsync({gameId: game._id});
        await t.cleanup(game._id);
      }
    });

    // --- #3 Village income lord share (dIncome.collectVillageIncome) ---

    // one village at (vx, vy) owned by a vassal with numLords lords, surrounded by resource hexes
    async function villageFixture(game, vx, vy, lordIds) {
      let ownerId = await Players.insertAsync({gameId: game._id, userId: 'u_' + Random.id(5), allies_above: lordIds});
      let i = 0;
      await dTest.eachAsync(Hx.getSurroundingHexes(vx, vy, _s.villages.num_rings_village), async function(h) {
        if (h.x == vx && h.y == vy) return;
        await Hexes.insertAsync({gameId: game._id, x: h.x, y: h.y, type: _s.market.types[i % _s.market.types.length], large: false});
        i++;
      });
      let villageId = await Villages.insertAsync({gameId: game._id, playerId: ownerId, x: vx, y: vy, level: 1,
        under_construction: false, lastIncomeUpdate: new Date(0)});
      return {ownerId: ownerId, villageId: villageId};
    }

    async function makeLords(game, n) {
      return await dTest.mapAsync(_.range(n), async function() {
        return await Players.insertAsync({gameId: game._id, userId: 'u_' + Random.id(5), allies_above: []});
      });
    }

    async function cleanVillageGame(game) {
      await Villages.removeAsync({gameId: game._id});
      await t.cleanup(game._id);
    }

    await dTest.eachAsync([[1, 0.06], [5, 0.3 / 5], [6, 0.3 / 6]], async function(c) {
      let numLords = c[0], pct = c[1];
      await run('collectVillageIncome pays each of ' + numLords + ' lords ' + pct + ' of the village income', async function() {
        await Games.removeAsync({}); await Players.removeAsync({}); await Villages.removeAsync({});
        let game = await t.createTestGame({hasStarted: true, startedAt: new Date()});
        try {
          let lords = await makeLords(game, numLords);
          let f = await villageFixture(game, 0, 0, lords);

          await dIncome.collectVillageIncome();

          let income = (await Villages.findOneAsync(f.villageId)).income;
          assert(income && income.grain > 0, 'village collected some income');
          let owner = await Players.findOneAsync(f.ownerId);
          _s.market.types_plus_gold.forEach(function(type) {
            near(owner.incomeFromVillages[type], income[type], 'owner incomeFromVillages.' + type);
            near(owner[type], income[type], 'owner ' + type);
          });
          await dTest.eachAsync(lords, async function(lordId) {
            let lord = await Players.findOneAsync(lordId);
            _s.market.types_plus_gold.forEach(function(type) {
              near(lord.incomeFromVassals[type], income[type] * pct, 'lord incomeFromVassals.' + type);
            });
          });
        } finally {
          await cleanVillageGame(game);
        }
      });
    });

    await run('collectVillageIncome: no lords pays only the owner, a shared lord gets the sum', async function() {
      await Games.removeAsync({}); await Players.removeAsync({}); await Villages.removeAsync({});
      let game = await t.createTestGame({hasStarted: true, startedAt: new Date()});
      try {
        let bystander = await Players.insertAsync({gameId: game._id, userId: 'u_' + Random.id(5), allies_above: []});
        let lone = await villageFixture(game, 0, 0, []);
        let lords = await makeLords(game, 1);
        let v1 = await villageFixture(game, 10, 10, lords);
        let v2 = await villageFixture(game, 20, 20, lords);

        await dIncome.collectVillageIncome();

        let b = await Players.findOneAsync(bystander);
        assert(!b.incomeFromVassals && !b.incomeFromVillages, 'player without a village or vassals is untouched');
        assert((await Players.findOneAsync(lone.ownerId)).incomeFromVillages.grain > 0, 'owner without lords is paid');

        let i1 = (await Villages.findOneAsync(v1.villageId)).income, i2 = (await Villages.findOneAsync(v2.villageId)).income;
        let lord = await Players.findOneAsync(lords[0]);
        _s.market.types_plus_gold.forEach(function(type) {
          near(lord.incomeFromVassals[type], (i1[type] + i2[type]) * 0.06, 'shared lord gets both shares of ' + type);
        });
      } finally {
        await cleanVillageGame(game);
      }
    });

    await run('collectVillageIncome skips villages under construction or recently paid', async function() {
      await Games.removeAsync({}); await Players.removeAsync({}); await Villages.removeAsync({});
      let game = await t.createTestGame({hasStarted: true, startedAt: new Date()});
      try {
        let lords = await makeLords(game, 1);
        let building = await villageFixture(game, 0, 0, lords);
        await Villages.updateAsync(building.villageId, {$set: {under_construction: true}});
        let recent = await villageFixture(game, 10, 10, lords);
        let recentDate = new Date();
        await Villages.updateAsync(recent.villageId, {$set: {lastIncomeUpdate: recentDate}});

        await dIncome.collectVillageIncome();

        assert(!(await Villages.findOneAsync(building.villageId)).income, 'village under construction not paid');
        equal(time((await Villages.findOneAsync(recent.villageId)).lastIncomeUpdate), recentDate.getTime(), 'recent village not paid again');
        assert(!(await Players.findOneAsync(lords[0])).incomeFromVassals, 'lord gets nothing');
        assert(!(await Players.findOneAsync(building.ownerId)).incomeFromVillages, 'owner gets nothing');
      } finally {
        await cleanVillageGame(game);
      }
    });

    await run('collectVillageIncome does not leak percentPerLord as a global', async function() {
      await Games.removeAsync({}); await Players.removeAsync({}); await Villages.removeAsync({});
      let game = await t.createTestGame({hasStarted: true, startedAt: new Date()});
      try {
        delete global.percentPerLord;
        await villageFixture(game, 0, 0, await makeLords(game, 1));
        await dIncome.collectVillageIncome();
        equal(typeof global.percentPerLord, 'undefined', 'no global percentPerLord');
      } finally {
        delete global.percentPerLord;
        await cleanVillageGame(game);
      }
    });


    // --- #4 Recentchats cleanup when a room is deleted ---

    async function roomFixture(gameId, fields) {
      let roomId = await Rooms.insertAsync(_.extend({gameId: gameId, name: 'bf_' + Random.id(4), type: 'normal',
        members: [], owner: 'bf_owner', created_at: new Date()}, fields || {}));
      await Recentchats.insertAsync({room_id: roomId, gameId: gameId, updated_at: new Date()});
      return roomId;
    }

    await run('deleting a room removes its recentchats on the worker (skipped unless DOMINUS_WORKER=true)', async function() {
      if (process.env.DOMINUS_WORKER != 'true') return 'skip';
      let gameId = 'bf_' + Random.id();
      try {
        let gone = await roomFixture(gameId), kept = await roomFixture(gameId);
        await Rooms.removeAsync(gone);
        assert(await waitFor(async function() { return await Recentchats.find({room_id: gone}).countAsync() === 0; }),
          'recentchat of the deleted room is removed');
        equal(await Recentchats.find({room_id: kept}).countAsync(), 1, 'other room keeps its recentchat');
      } finally {
        await Rooms.removeAsync({gameId: gameId});
        await Recentchats.removeAsync({gameId: gameId});
      }
    });

    await run('destroyKingChatroom removes the room recentchat on the worker (skipped unless DOMINUS_WORKER=true)', async function() {
      if (process.env.DOMINUS_WORKER != 'true') return 'skip';
      let game = await t.createTestGame({hasStarted: true});
      try {
        let king = await Players.insertAsync({gameId: game._id, userId: 'u_' + Random.id(5), is_king: true});
        let roomId = await roomFixture(game._id, {type: 'king', owner: king, members: [king]});
        await dChat.destroyKingChatroom(king);
        equal(await Rooms.find(roomId).countAsync(), 0, 'king room deleted');
        assert(await waitFor(async function() { return await Recentchats.find({room_id: roomId}).countAsync() === 0; }),
          'recentchat of the king room is removed');
      } finally {
        await Rooms.removeAsync({gameId: game._id});
        await Recentchats.removeAsync({gameId: game._id});
        await Roomchats.removeAsync({gameId: game._id});
        await t.cleanup(game._id);
      }
    });

    await run('starting a rooms observer never deletes recentchats of existing rooms', async function() {
      // what the worker does on every deploy: observe() only calls removed for
      // rooms deleted after it starts
      let gameId = 'bf_' + Random.id();
      let handle = null;
      try {
        let rooms = [await roomFixture(gameId), await roomFixture(gameId), await roomFixture(gameId)];
        // as packages/dominus-chat/server/recentChats.js does
        handle = await Rooms.find({gameId: gameId}, {fields: {_id: 1}}).observeAsync({
          removed: function(room) { void Recentchats.removeAsync({room_id: room._id}); }
        });
        await dTest.sleep(2000);
        equal(await Recentchats.find({room_id: {$in: rooms}}).countAsync(), 3, 'all recentchats still there');
      } finally {
        if (handle) handle.stop();
        await Rooms.removeAsync({gameId: gameId});
        await Recentchats.removeAsync({gameId: gameId});
      }
    });


    // --- #5 Settings cache ---

    // Since upgrade PR 6 every game is cached, not only running ones (see
    // packages/dominus-settings/namespace.js), so an ended game stays.
    await run('settings cache follows a game from start to end and removal', async function() {
      let ended = await t.createTestGame({hasStarted: true, hasEnded: false, isSpeed: false});
      let removed = await t.createTestGame({hasStarted: true, hasEnded: false});
      try {
        assert(await waitFor(function() { return !!_gs._cachedGames[ended._id]; }), 'started game is cached');
        await Games.updateAsync(ended._id, {$set: {isSpeed: true}});
        assert(await waitFor(function() { return _gs._cachedGames[ended._id] && _gs._cachedGames[ended._id].isSpeed === true; }),
          'cache picks up a changed flag');

        await Games.updateAsync(ended._id, {$set: {hasEnded: true, isSpeed: false}});
        assert(await waitFor(function() { return _gs._cachedGames[ended._id] && _gs._cachedGames[ended._id].isSpeed === false; }),
          'ended game stays cached and follows its changes');
        equal(_gs.getGame(ended._id).isSpeed, false, 'ended game settings still readable');

        assert(await waitFor(function() { return !!_gs._cachedGames[removed._id]; }), 'second game is cached');
        await Games.removeAsync(removed._id);
        assert(await waitFor(function() { return !_gs._cachedGames[removed._id]; }), 'removed game leaves the cache');
      } finally {
        await t.cleanup(ended._id);
        await t.cleanup(removed._id);
      }
    });

    await run('every _gs setting is identical whether the game is cached or not, for all flag combinations', async function() {
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

      let games = await dTest.mapAsync(_.range(16), async function(n) {
        let overrides = {hasStarted: true, hasEnded: false};
        flags.forEach(function(flag, i) { overrides[flag] = !!(n & (1 << i)); });
        return await t.createTestGame(overrides);
      });
      try {
        assert(await waitFor(function() { return games.every(function(g) { return !!_gs._cachedGames[g._id]; }); }),
          'all games cached');
        let cached = games.map(function(g) { return snapshot(g._id); });

        // read them again from the database, as _gs.ensureGame does for a
        // game this server hasn't cached yet
        let uncached = await dTest.mapAsync(games, async function(g) {
          delete _gs._cachedGames[g._id];
          await _gs.ensureGame(g._id);
          assert(_gs._cachedGames[g._id], 'game cached again by ensureGame');
          return snapshot(g._id);
        });

        games.forEach(function(g, i) {
          _.each(cached[i], function(value, key) {
            equal(uncached[i][key], value, 'game ' + i + ' ' + key);
          });
        });
      } finally {
        await dTest.eachAsync(games, async function(g) { await t.cleanup(g._id); });
      }
    });

    await run('getGame reads only the settings fields, cached or read by ensureGame, and a miss or an unknown id gives {}', async function() {
      let game = await t.createTestGame({hasStarted: false, isSpeed: true, tree: {big: true}, minimap: {big: true}});
      let error = console.error;
      console.error = function() {};
      try {
        assert(await waitFor(function() { return !!_gs._cachedGames[game._id]; }), 'cached');
        await dTest.eachAsync([true, false], async function(cached) {
          if (!cached) {
            delete _gs._cachedGames[game._id];
            await _gs.ensureGame(game._id);
          }
          let g = _gs.getGame(game._id);
          equal(g.isSpeed, true, 'flag read (cached ' + cached + ')');
          assert(!('tree' in g), 'tree not loaded (cached ' + cached + ')');
          assert(!('minimap' in g), 'minimap not loaded (cached ' + cached + ')');
        });
        delete _gs._cachedGames[game._id];
        equal(JSON.stringify(_gs.getGame(game._id)), '{}', 'a game missing from the cache reads as {} (the defaults)');
        equal(JSON.stringify(_gs.getGame('bf_missing_' + Random.id())), '{}', 'unknown id');
        equal(JSON.stringify(_gs.getGame(undefined)), '{}', 'no id');
      } finally {
        console.error = error;
        await t.cleanup(game._id);
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
    async function runBakeJob(opts) {
      let calls = {chmod: [], jpg: [], s3: [], queued: [], result: null, returnsPromise: false};
      let restores = [
        stub(Mapbaker, 'bakeCountry', function() { return opts.data; }),
        stub(Mapbaker, 'fs', {
          existsSync: function() { return !!opts.svgExists; },
          chmodSync: function(f) { calls.chmod.push(f); }
        }),
        stub(Mapbaker, 'createJpgImage', function(inFile, outFile) { calls.jpg.push(outFile); return opts.jpgOk ? outFile : false; }),
        stub(Mapbaker, 'uploadToS3', function(file) { calls.s3.push(file); return opts.s3Ok ? 'https://bf/' + file : false; }),
        stub(Queues, 'addAsync', async function(name, data) { calls.queued.push({name: name, data: data}); return true; }),
        stub(Meteor.settings.public.s3, 'serveBakesFromS3', !!opts.s3),
        stubEnv('DOMINUS_TEST', 'false')
      ];
      try {
        // Bull needs a promise; the job is async now, and it finishes before
        // the stubs are put back
        let job = function() { return Mapbaker.processBakeCountryJob({data: {countryId: 'bf_c'}}); };
        let returned = job();
        calls.returnsPromise = dTest.isPromise(returned);
        calls.result = await returned;
      } finally {
        restoreAll(restores);
      }
      return calls;
    }

    await run('bakeCountry job: no data from bakeCountry resolves and does nothing else', async function() {
      let c = await runBakeJob({data: false});
      assert(c.returnsPromise, 'returns a promise');
      equal(c.chmod.length, 0, 'no chmod');
      equal(c.jpg.length, 0, 'no jpg');
      equal(c.queued.length, 0, 'no finishImage');
    });

    await run('bakeCountry job: missing svg resolves and does nothing else', async function() {
      let c = await runBakeJob({data: bakeData(), svgExists: false});
      assert(c.returnsPromise, 'returns a promise');
      equal(c.chmod.length, 0, 'no chmod');
      equal(c.jpg.length, 0, 'no jpg');
      equal(c.queued.length, 0, 'no finishImage');
    });

    await run('bakeCountry job: failed jpg resolves without uploading or finishing', async function() {
      let c = await runBakeJob({data: bakeData(), svgExists: true, jpgOk: false, s3: true, s3Ok: true});
      assert(c.returnsPromise, 'returns a promise');
      equal(c.chmod.length, 2, 'both svgs chmodded');
      equal(c.s3.length, 0, 'no upload');
      equal(c.queued.length, 0, 'no finishImage');
    });

    await run('bakeCountry job: happy path queues finishImage for both images', async function() {
      await dTest.eachAsync([{s3: false}, {s3: true, s3Ok: true}, {s3: true, s3Ok: false}], async function(o) {
        let c = await runBakeJob(_.extend({data: bakeData(), svgExists: true, jpgOk: true}, o));
        let label = ' (s3 ' + o.s3 + ', upload ok ' + o.s3Ok + ')';
        assert(c.returnsPromise, 'returns a promise' + label);
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

    await run('forumTopics pastMonth filter works and the other filters are unchanged', async function() {
      let user = await t.createTestUser({verifiedEmail: true});
      let unverified = await t.createTestUser({verifiedEmail: false});
      let banned = await t.createTestUser({verifiedEmail: true, banned: true});
      let cat1 = 'bf_cat_' + Random.id(), cat2 = 'bf_cat_' + Random.id();
      let monthsAgo = moment().subtract(2, 'months').toDate();
      let topic = async function(fields) {
        return await Forumtopics.insertAsync(_.extend({title: 't', numPosts: 1, numViews: 0, createdAt: new Date(),
          updatedAt: new Date(), lastPostDate: new Date()}, fields));
      };
      let recent = await topic({categoryId: cat1});
      let old = await topic({categoryId: cat1, updatedAt: monthsAgo, createdAt: monthsAgo});
      let pinned = await topic({categoryId: cat1, isPinned: true});
      let other = await topic({categoryId: cat2});
      let ours = [recent, old, pinned, other];
      let ids = function(out) { return _.intersection(allPublishedIds(out), ours); };
      try {
        let month = await runPublication('forumTopics', user._id, ['post', 50, 'all', 'pastMonth']);
        sameIds(ids(month), [recent, other], 'pastMonth: only recent, unpinned topics');
        let cutoff = month.cursor._cursorDescription.selector.updatedAt.$gte;
        assert(Math.abs(cutoff.getTime() - moment().subtract(1, 'months').valueOf()) < 60000, 'cutoff is one month ago');

        sameIds(ids(await runPublication('forumTopics', user._id, ['post', 50, 'all', 'all'])), [recent, old, other], 'all: every unpinned topic');
        sameIds(ids(await runPublication('forumTopics', user._id, ['post', 50, cat1, 'pastMonth'])), [recent], 'pastMonth + category');
        sameIds(ids(await runPublication('forumTopics', user._id, ['post', 50, cat1, 'all'])), [recent, old], 'category only');
        equal(publishedIds(await runPublication('forumTopics', user._id, ['topic', 1, cat1, 'all']), 'forumtopics').length, 1, 'numShow limit');

        await dTest.eachAsync([null, unverified._id, banned._id], async function(userId) {
          let out = await runPublication('forumTopics', userId, ['post', 50, 'all', 'pastMonth']);
          equal(out.ready, 1, 'ready for ' + userId);
          equal(allPublishedIds(out).length, 0, 'nothing published for ' + userId);
        });
      } finally {
        await Forumtopics.removeAsync({_id: {$in: ours}});
        await dTest.eachAsync([user, unverified, banned], async function(u) { await t.cleanupUser(u._id); });
      }
    });


    // --- #8a room_list publication ---

    await run('room_list: bad arguments are refused, null ones give an empty ready subscription, good ones the player rooms', async function() {
      let gameId = 'bf_' + Random.id();
      let p1 = 'bf_p_' + Random.id(), p2 = 'bf_p_' + Random.id(), p3 = 'bf_p_' + Random.id();
      let r1 = await Rooms.insertAsync({gameId: gameId, members: [p1, p2], type: 'normal', name: 'a'});
      let r2 = await Rooms.insertAsync({gameId: gameId, members: [p2], type: 'normal', name: 'b'});
      let r3 = await Rooms.insertAsync({gameId: gameId, members: [p3], type: 'normal', name: 'c'});
      try {
        // a missing argument, or one that isn't a string or null, is refused
        // (server/publicationGate.js and the check()s, see server/argumentCheckTests.js)
        await dTest.eachAsync([[], [gameId], [gameId, {$exists: true}], [gameId, 5], [{$ne: null}, p2]], async function(args) {
          let error = null;
          try {
            await runPublication('room_list', 'bf_user', args);
          } catch (e) {
            error = e;
          }
          assert(error, 'refused for ' + JSON.stringify(args));
        });

        // the browser sends null for an id it doesn't have
        await dTest.eachAsync([[gameId, null], [null, p2]], async function(args) {
          let out = await runPublication('room_list', 'bf_user', args);
          equal(out.ready, 1, 'ready once for ' + JSON.stringify(args));
          equal(allPublishedIds(out).length, 0, 'nothing published for ' + JSON.stringify(args));
        });

        let out = await runPublication('room_list', 'bf_user', [gameId, p2]);
        equal(out.ready, 1, 'ready once');
        sameIds(publishedIds(out, 'room_list'), [r1, r2], 'rooms the player is in');
        equal(Object.keys(out.docs.room_list[r1]).length, 0, 'only _id published');
        assert(publishedIds(out, 'room_list').indexOf(r3) === -1, 'no other rooms');
      } finally {
        await Rooms.removeAsync({gameId: gameId});
      }
    });


    // --- #8b rightPanelTree publication ---

    await run('rightPanelTree publishes the lords and is always ready', async function() {
      let game = await t.createTestGame({hasStarted: true});
      try {
        let lordFields = function(n) {
          return {gameId: game._id, userId: 'u_' + Random.id(5), name: 'lord' + n, username: 'lord' + n,
            x: n, y: n, castle_id: 'c' + n, lord: null, income: 999};
        };
        let l1 = await Players.insertAsync(lordFields(1)), l2 = await Players.insertAsync(lordFields(2));
        let unrelated = await Players.insertAsync(lordFields(3));
        let player = await Players.insertAsync({gameId: game._id, userId: 'u_' + Random.id(5), allies_above: [l1, l2]});
        let noAllies = await Players.insertAsync({gameId: game._id, userId: 'u_' + Random.id(5)});

        let out = await runPublication('rightPanelTree', 'bf_user', [player]);
        equal(out.ready, 1, 'ready once');
        sameIds(publishedIds(out, 'right_panel_tree_players'), [l1, l2], 'exactly the lords');
        assert(publishedIds(out, 'right_panel_tree_players').indexOf(unrelated) === -1, 'no other players');
        _.each(out.docs.right_panel_tree_players, function(fields) {
          assert(_.difference(Object.keys(fields), ['name', 'x', 'y', 'castle_id', 'lord', 'username']).length === 0,
            'only the tree fields are published');
        });

        await dTest.eachAsync([[noAllies, 'bf_user'], ['bf_missing_' + Random.id(), 'bf_user'], [null, null]], async function(c) {
          let o = await runPublication('rightPanelTree', c[1], [c[0]]);
          equal(o.ready, 1, 'ready once for ' + c[0] + ' as ' + c[1]);
          equal(allPublishedIds(o).length, 0, 'nothing published for ' + c[0] + ' as ' + c[1]);
        });

        let refused = null;
        try {
          await runPublication('rightPanelTree', null, [{$ne: null}]);
        } catch (e) {
          refused = e;
        }
        assert(refused, 'an object for an id is refused');

        // public so logged out spectators can see the tree
        let loggedOut = await runPublication('rightPanelTree', null, [player]);
        sameIds(publishedIds(loggedOut, 'right_panel_tree_players'), [l1, l2], 'logged out viewers get the lords too');
      } finally {
        await t.cleanup(game._id);
      }
    });


    // --- #9 Waypoint reordering (decreasePathIndex / increasePathIndex) ---

    // paths for one army; times are ms ago for last_move_at, null for none
    async function insertPaths(gameId, userId, armyId, times, extra) {
      return await dTest.mapAsync(times, async function(ago, index) {
        return await Armypaths.insertAsync(_.extend({
          gameId: gameId, armyId: armyId, user_id: userId, index: index,
          x: index + 1, y: armyId.length + index, paused: false, speed: 10,
          hexes: [{x: 0, y: 0, countryId: 'bf'}], countryIds: ['bf'], distance: 1, time: 1000, dirtyMoveTotals: false,
          last_move_at: ago === null ? null : new Date(Date.now() - ago),
          createdAt: new Date()
        }, extra || {}));
      });
    }

    async function armyState(armyId) {
      return (await Armypaths.find({armyId: armyId}, {sort: {index: 1}}).fetchAsync()).map(function(p) {
        return {_id: p._id, index: p.index, x: p.x, y: p.y, last_move_at: time(p.last_move_at)};
      });
    }

    var HOURS_3 = 3 * 60 * 60 * 1000, MINUTE = 60 * 1000;

    await dTest.eachAsync([['the same game', false], ['another game', true]], async function(c) {
      await run('decreasePathIndex keeps the army own move time when another army is in ' + c[0], async function() {
        let userId = 'bf_u_' + Random.id();
        let gameB = 'bf_g_' + Random.id(), gameA = c[1] ? 'bf_g_' + Random.id() : gameB;
        let armyA = 'bf_a_' + Random.id(), armyB = 'bf_b_' + Random.id();
        try {
          // A is inserted first so a lookup without armyId finds A's path.
          // paused keeps the live moveArmiesJob (DOMINUS_WORKER) from moving A mid-test.
          await insertPaths(gameA, userId, armyA, [HOURS_3, HOURS_3], {paused: true});
          let aBefore = await Armypaths.find({armyId: armyA}).fetchAsync();
          let b = await insertPaths(gameB, userId, armyB, [MINUTE, MINUTE]);
          let bTime = time((await Armypaths.findOneAsync(b[0])).last_move_at);

          await callAs(userId, 'decreasePathIndex', [b[1]]);

          let moved = await Armypaths.findOneAsync(b[1]);
          equal(moved.index, 0, 'waypoint moved to the front');
          equal(time(moved.last_move_at), bTime, 'it keeps army B own last_move_at');
          equal((await Armypaths.findOneAsync(b[0])).index, 1, 'old first waypoint is now second');
          equal(EJSON.stringify(await Armypaths.find({armyId: armyA}).fetchAsync()), EJSON.stringify(aBefore), 'army A paths untouched');
        } finally {
          await Armypaths.removeAsync({user_id: userId});
        }
      });
    });

    await run('decreasePathIndex: the reordered army does not step early in moveArmiesJob', async function() {
      await Armypaths.removeAsync({});
      let userId = 'bf_u_' + Random.id(), gameId = 'bf_g_' + Random.id();
      let armyA = 'bf_a_' + Random.id(), armyB = 'bf_b_' + Random.id();
      let restores = [stub(Queues, 'addAsync', async function() { return true; })];
      try {
        // A is idle (no hexes) with an old move time, B moved a minute ago
        await insertPaths(gameId, userId, armyA, [HOURS_3], {hexes: null});
        let b = await insertPaths(gameId, userId, armyB, [MINUTE, MINUTE]);
        await Armies.insertAsync({_id: armyB, gameId: gameId, user_id: userId, playerId: 'bf_p', x: 0, y: 0,
          last_move_at: new Date(Date.now() - MINUTE), moveDistance: 1});

        await callAs(userId, 'decreasePathIndex', [b[1]]);
        // pathfinding would normally refill these
        await Armypaths.updateAsync(b[1], {$set: {hexes: [{x: 7, y: 7, countryId: 'bf'}], speed: 10}});

        await dArmies.moveArmiesJob();

        let army = await Armies.findOneAsync(armyB);
        equal(army.x, 0, 'army has not moved (x)');
        equal(army.y, 0, 'army has not moved (y)');
        equal((await Armypaths.findOneAsync(b[1])).hexes.length, 1, 'path not advanced');
      } finally {
        restoreAll(restores);
        await Armypaths.removeAsync({user_id: userId});
        await Armies.removeAsync({user_id: userId});
        await Markers.removeAsync({unitId: armyB});
      }
    });

    await run('decreasePathIndex on a single army behaves as before', async function() {
      let userId = 'bf_u_' + Random.id(), gameId = 'bf_g_' + Random.id(), army = 'bf_a_' + Random.id();
      try {
        let p = await insertPaths(gameId, userId, army, [MINUTE, MINUTE, MINUTE, MINUTE, MINUTE, MINUTE]);
        let firstTime = time((await Armypaths.findOneAsync(p[0])).last_move_at);

        // 1 -> 0 takes the first waypoint's time
        await callAs(userId, 'decreasePathIndex', [p[1]]);
        let s = await armyState(army);
        equal(s.map(function(x) { return x._id; }).join(), [p[1], p[0], p[2], p[3], p[4], p[5]].join(), 'order after 1 -> 0');
        equal(s[0].last_move_at, firstTime, 'new first waypoint has the old first time');
        // re-path window is index -2..2 (path.index-3 .. path.index+1)
        await dTest.eachAsync([p[1], p[0], p[2]], async function(id) {
          equal((await Armypaths.findOneAsync(id)).hexes, null, 'waypoint in the re-path window is cleared');
        });
        await dTest.eachAsync([p[3], p[4], p[5]], async function(id) {
          assert((await Armypaths.findOneAsync(id)).hexes !== null, 'waypoint outside the re-path window keeps its hexes');
        });

        // 4 -> 3 clears last_move_at on the moved waypoint, as it always has
        await callAs(userId, 'decreasePathIndex', [p[4]]);
        s = await armyState(army);
        equal(s.map(function(x) { return x._id; }).join(), [p[1], p[0], p[2], p[4], p[3], p[5]].join(), 'order after 4 -> 3');
        equal((await Armypaths.findOneAsync(p[4])).last_move_at, null, 'moved waypoint last_move_at is null');

        await dTest.eachAsync([p[4], p[3], p[5]], async function(id) {
          equal((await Armypaths.findOneAsync(id)).hexes, null, 'waypoint in the second re-path window is cleared');
        });

        // index 0 is a no-op
        let before = EJSON.stringify(await armyState(army));
        await callAs(userId, 'decreasePathIndex', [p[1]]);
        equal(EJSON.stringify(await armyState(army)), before, 'index 0 does nothing');

        // someone else's waypoint throws
        let threw = false;
        try { await callAs('bf_other_' + Random.id(), 'decreasePathIndex', [p[2]]); } catch (e) { threw = true; }
        assert(threw, 'other user cannot reorder');
        equal(EJSON.stringify(await armyState(army)), before, 'nothing changed');
      } finally {
        await Armypaths.removeAsync({user_id: userId});
      }
    });

    await run('decreasePathIndex with no first waypoint for the army changes nothing', async function() {
      let userId = 'bf_u_' + Random.id(), gameId = 'bf_g_' + Random.id();
      let armyA = 'bf_a_' + Random.id(), armyB = 'bf_b_' + Random.id();
      try {
        // paused keeps the live moveArmiesJob (DOMINUS_WORKER) from moving A mid-test
        await insertPaths(gameId, userId, armyA, [HOURS_3], {paused: true});
        // B's only waypoint sits at index 1 (broken indexes)
        let b = await Armypaths.insertAsync({gameId: gameId, armyId: armyB, user_id: userId, index: 1, x: 9, y: 9,
          paused: false, speed: 10, hexes: null, countryIds: null, last_move_at: new Date(Date.now() - MINUTE)});
        let before = EJSON.stringify(await Armypaths.find({user_id: userId}, {sort: {_id: 1}}).fetchAsync());

        await callAs(userId, 'decreasePathIndex', [b]);

        equal(EJSON.stringify(await Armypaths.find({user_id: userId}, {sort: {_id: 1}}).fetchAsync()), before, 'nothing changed');
      } finally {
        await Armypaths.removeAsync({user_id: userId});
      }
    });

    await run('increasePathIndex behaves as before', async function() {
      let userId = 'bf_u_' + Random.id(), gameId = 'bf_g_' + Random.id(), army = 'bf_a_' + Random.id();
      try {
        let p = await insertPaths(gameId, userId, army, [MINUTE, 2 * MINUTE, 3 * MINUTE]);
        let firstTime = time((await Armypaths.findOneAsync(p[0])).last_move_at);
        await callAs(userId, 'increasePathIndex', [p[0]]);
        let s = await armyState(army);
        equal(s.map(function(x) { return x._id; }).join(), [p[1], p[0], p[2]].join(), 'order after 0 -> 1');
        equal(s[0].last_move_at, firstTime, 'new first waypoint takes the old first time');

        let before = EJSON.stringify(await armyState(army));
        await callAs(userId, 'increasePathIndex', [p[2]]);
        equal(EJSON.stringify(await armyState(army)), before, 'last waypoint does nothing');
      } finally {
        await Armypaths.removeAsync({user_id: userId});
      }
    });

    await run('client simulation of waypoint reordering ends in the same order as the server', async function() {
      let userId = 'bf_u_' + Random.id(), gameId = 'bf_g_' + Random.id();
      let server = 'bf_s_' + Random.id(), sim = 'bf_m_' + Random.id();
      try {
        let ps = await insertPaths(gameId, userId, server, [MINUTE, MINUTE, MINUTE, MINUTE]);
        let pm = await insertPaths(gameId, userId, sim, [MINUTE, MINUTE, MINUTE, MINUTE]);
        // same steps on both armies: by position in the original list
        let steps = [['decreasePathIndex', 2], ['increasePathIndex', 0], ['decreasePathIndex', 1], ['increasePathIndex', 3]];
        let positions = async function(army, ids) {
          return await (await armyState(army)).map(function(p) { return p.index + ':' + ids.indexOf(p._id); }).join();
        };
        let fromServer = await dTest.mapAsync(steps, async function(step) {
          await callAs(userId, step[0], [ps[step[1]]], false);
          return await positions(server, ps);
        });
        // the simulation runs as in the browser, on minimongo
        let fromSimulation = await dTest.onClient(function() {
          return dTest.mapAsync(steps, async function(step) {
            await callAs(userId, step[0], [pm[step[1]]], true);
            return await positions(sim, pm);
          });
        });
        steps.forEach(function(step, n) {
          equal(fromSimulation[n], fromServer[n], 'same order after ' + step[0] + ' ' + step[1]);
        });
        assert(fromServer[0] !== fromServer[1], 'the steps change the order');
      } finally {
        await Armypaths.removeAsync({user_id: userId});
      }
    });


    // Meteor 2.16 brought underscore@1.6.1, whose _.where is _.find. The
    // spectators' left menu used it and broke; it uses _.filter now. Meteor 3's
    // underscore@1.6.4 fixed it (this was a "known bug" test until then).
    await run('_.where returns every match again in underscore ' + _.VERSION, function() {
      let panels = [{name: 'a', spectator: true}, {name: 'b'}, {name: 'c', spectator: true}];
      let found = _.where(panels, {spectator: true});
      assert(Array.isArray(found), '_.where gives an array');
      equal(_.pluck(found, 'name').join(), 'a,c', 'with both matches');
      equal(_.pluck(_.filter(panels, function(p) { return p.spectator; }), 'name').join(), 'a,c', '_.filter finds both');
      equal(_.findWhere(panels, {spectator: true}).name, 'a', '_.findWhere gives the first');
    });
  };
}
