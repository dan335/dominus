// Battles of each kind, round by round (upgrade PR 14, Oct 2026).
//
// Three players fight the battles the game has: two armies in the open, an
// army against a village, an army against a capital, an army against a
// castle, and a lord's army defending its new vassal's castle. They play on the fixed game clock
// of the game simulation (server/lib/testRunnerSimulation.js), so the battle
// job, the crons that start each round and the jobs a battle adds run as the
// clock passes their time. After each battle the test checks what it should
// have done, and compares every document with tests/golden/battles.json,
// which was recorded from the code before the battle job became async.
//
// A change meant to change how battles go needs that file recorded again:
// each run writes what it got to .test-results/battles/actual.json and each
// step's documents to .test-results/battles/step-NN.json (see the top of
// server/simulationTests.js for how to check such a change).
//
// It runs as part of runAllTests (server/lib/testRunner.js), so the same rule
// applies: only against a local development database.

if (Meteor.isServer) {

  var fs = Npm.require('fs');
  var path = Npm.require('path');

  var SEED = 'dominus battles';
  var START_AT = new Date(Date.UTC(2026, 0, 19, 9, 0, 0));
  var NAMES = ['ares', 'hera', 'zeus'];
  var GOLDEN = 'tests/golden/battles.json';

  var soldiers = function(values) { return dTest.soldierCounts(values); };

  var hexDistance = function(x1, y1, x2, y2) {
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs((x1 + y1) - (x2 + y2)));
  };

  var repoPath = function(file) {
    return path.join(dTest.appDir(), file);
  };

  // A free hex in a country, at least two hexes from every building, nearest
  // to (x, y) first, then by x and y. opts.type: only hexes of that type.
  var freeHexNear = async function(sim, x, y, opts) {
    opts = opts || {};
    var buildings = [];
    for (const c of [Castles, Villages, Capitals]) {
      buildings = buildings.concat(await c.find({gameId: sim.gameId}, {fields: {x: 1, y: 1}}).fetchAsync());
    }
    var find = {gameId: sim.gameId, hasBuilding: {$ne: true}};
    if (opts.type) find.type = opts.type;
    var hexes = await Hexes.find(find, {sort: {x: 1, y: 1}}).fetchAsync();
    hexes = await dTest.filterAsync(hexes, async function(h) {
      return await Mapmaker.coordsToCountryId(sim.gameId, h.x, h.y) &&
        !_.some(buildings, function(b) { return hexDistance(b.x, b.y, h.x, h.y) < 2; }) &&
        !_.some(opts.not || [], function(n) { return n.x == h.x && n.y == h.y; });
    });
    if (!hexes.length) throw new Error('FAIL: no free hex near ' + x + ',' + y);
    var hex = _.min(hexes, function(h) { return hexDistance(x, y, h.x, h.y); });
    return {x: hex.x, y: hex.y};
  };

  var armiesOf = async function(sim, name) {
    return await Armies.find({gameId: sim.gameId, user_id: sim.users[name]._id}, {sort: {_id: 1}}).fetchAsync();
  };

  // hires soldiers at the player's castle and marches them to (x, y); returns the army
  var march = async function(sim, name, values, to) {
    var castle = await sim.castle(name);
    var before = _.pluck(await armiesOf(sim, name), '_id');
    await sim.call(name, 'hireArmy', sim.gameId, soldiers(values), castle._id, 'castle');
    await sim.call(name, 'createArmyFromBuilding', sim.gameId, 'castle', castle._id, soldiers(values));
    var army = _.find(await armiesOf(sim, name), function(a) { return before.indexOf(a._id) == -1; });
    if (!army) throw new Error('FAIL: ' + name + '\'s army was not made');
    if (to) await sim.call(name, 'addArmyPath', sim.gameId, to.x, to.y, army._id);
    return army;
  };

  var arrived = async function(armyId, to) {
    var army = await Armies.findOneAsync(armyId);
    return army && army.x == to.x && army.y == to.y && !await Armypaths.findOneAsync({armyId: armyId});
  };

  var battleAt = async function(sim, at) {
    return await Battles2.findOneAsync({gameId: sim.gameId, x: at.x, y: at.y}, {sort: {createdAt: -1}});
  };

  // the battle at (at) is over
  var battleOver = async function(sim, at) {
    var battle = await battleAt(sim, at);
    return battle && battle.isOver;
  };

  var power = function(n) { return Math.round(n * 1000) / 1000; };

  // What each step is about, in words, so the golden file can be read and a
  // change shows up as more than a hash.
  var facts = async function(sim) {
    var out = {battles: [], players: {}, capitals: []};
    await Battles2.find({gameId: sim.gameId}, {sort: {createdAt: 1, x: 1, y: 1}}).forEachAsync(function(b) {
      out.battles.push({
        x: b.x, y: b.y, rounds: b.roundNumber, isOver: b.isOver, showBattle: b.showBattle,
        units: _.map(b.titleInfo && b.titleInfo.armies, function(a) {
          return _.compact([a.username, a.unitType, a.destroyed && 'destroyed', a.tookCastle && 'took the castle', a.tookCapital && 'took the capital']).join(' ');
        }),
        loses: _.map(b.loses, function(l) {
          return {unit: _.compact([l.username, l.unitType]).join(' '), soldiers: _.pick(l, _s.armies.types), power: power(l.power)};
        })
      });
    });
    await Players.find({gameId: sim.gameId}, {sort: {username: 1}}).forEachAsync(async function(p) {
      var castle = await Castles.findOneAsync(p.castle_id);
      var alerts = {};
      await Alerts.find({gameId: sim.gameId, 'playerIds.playerId': p._id}).forEachAsync(function(a) { var type = a.type.replace(/^alert_/, ''); alerts[type] = (alerts[type] || 0) + 1; });
      out.players[p.username] = {
        lord: await sim.nameOf(p.lord),
        vassals: (await dTest.mapAsync(p.vassals, sim.nameOf)).sort(),
        losses: p.losses,
        castle: castle && _.pick(castle, _s.armies.types),
        armies: await Armies.find({playerId: p._id}, {sort: {_id: 1}}).mapAsync(function(a) {
          return _.extend({x: a.x, y: a.y, onAllyBuilding: a.onAllyBuilding}, _.pick(a, _s.armies.types));
        }),
        villages: await Villages.find({playerId: p._id}, {sort: {_id: 1}}).mapAsync(function(v) { return _.extend({x: v.x, y: v.y}, _.pick(v, _s.armies.types)); }),
        alerts: alerts
      };
    });
    await Capitals.find({gameId: sim.gameId}, {sort: {x: 1, y: 1}}).forEachAsync(async function(c) {
      out.capitals.push(_.extend({x: c.x, y: c.y, owner: await sim.nameOf(c.playerId)}, _.pick(c, _s.armies.types)));
    });
    return out;
  };

  // where the scenario's battles are, filled in as it plays
  var at = {};

  var SCENARIO = [

    {name: 'three players sign up and the game starts', run: async function(sim) {
      await dTest.eachAsync(NAMES, async function(name) {
        await sim.addUser(name, {emails: [{address: 'sim_' + name + '@example.com', verified: true}]});
      });
      var game = await dTest.helpers.createTestGame({name: 'Battles', startAt: dClock.now(), createdAt: dClock.now()});
      sim.gameId = game._id;
      await dTest.eachAsync(NAMES, async function(name) {
        var user = sim.users[name];
        await Gamesignups.insertAsync({gameId: game._id, userId: user._id, username: user.username, createdAt: dClock.now(), usedToken: false});
      });
      await sim.advance(2 * 60 * 1000);
      await dTest.eachAsync(NAMES, async function(name) {
        await Players.updateAsync((await sim.player(name))._id, {$inc: {gold: 5000, grain: 30000, lumber: 20000, ore: 50000, wool: 20000, clay: 5000, glass: 2000}});
      });
    }},

    {name: 'two armies meet in the open', run: async function(sim) {
      var hera = await sim.castle('hera');
      at.open = await freeHexNear(sim, hera.x, hera.y);
      var heras = await march(sim, 'hera', {footmen: 60, archers: 20}, at.open);
      await sim.advance(3 * 60 * 60 * 1000, {waitingFor: 'hera\'s army reaching the field', until: function() { return arrived(heras._id, at.open); }});
      await march(sim, 'ares', {footmen: 100, archers: 30, cavalry: 30}, at.open);
      await sim.advance(6 * 60 * 60 * 1000, {waitingFor: 'the battle in the open', until: function() { return battleOver(sim, at.open); }});
      await sim.advance(5 * 60 * 1000);
    }},

    {name: 'an army burns a village', run: async function(sim) {
      var hera = await sim.castle('hera');
      at.village = await freeHexNear(sim, hera.x, hera.y, {type: 'grain', not: [at.open]});
      var builder = await march(sim, 'hera', {footmen: 10}, at.village);
      await sim.advance(3 * 60 * 60 * 1000, {waitingFor: 'hera reaching the grain hex', until: function() { return arrived(builder._id, at.village); }});
      await sim.call('hera', 'buildVillage', sim.gameId, at.village.x, at.village.y);
      var built = async function() { var v = await Villages.findOneAsync({playerId: (await sim.player('hera'))._id}); return v && !v.under_construction; };
      await sim.advance(2 * 60 * 60 * 1000, {waitingFor: 'hera\'s village being built', until: built});
      var attacker = _.max(await armiesOf(sim, 'ares'), function(a) { return a.footmen; });
      await sim.call('ares', 'addArmyPath', sim.gameId, at.village.x, at.village.y, attacker._id);
      await sim.advance(6 * 60 * 60 * 1000, {waitingFor: 'the battle at the village', until: function() { return battleOver(sim, at.village); }});
      await sim.advance(5 * 60 * 1000);
    }},

    {name: 'an army takes a capital', run: async function(sim) {
      var ares = await sim.castle('ares');
      var capital = _.min(await Capitals.find({gameId: sim.gameId}, {sort: {x: 1, y: 1}}).fetchAsync(), function(c) { return hexDistance(ares.x, ares.y, c.x, c.y); });
      at.capital = {x: capital.x, y: capital.y};
      await march(sim, 'ares', {footmen: 120, archers: 40, cavalry: 40}, at.capital);
      await sim.advance(8 * 60 * 60 * 1000, {waitingFor: 'the battle at the capital', until: function() { return battleOver(sim, at.capital); }});
      await sim.advance(5 * 60 * 1000);
    }},

    {name: 'an army takes a castle', run: async function(sim) {
      var hera = await sim.castle('hera');
      at.castle = {x: hera.x, y: hera.y};
      // made in her castle's hex, hera's army joins the castle
      await march(sim, 'hera', {footmen: 20, pikemen: 10});
      await march(sim, 'ares', {footmen: 150, archers: 50, cavalry: 60, catapults: 10}, at.castle);
      await sim.advance(8 * 60 * 60 * 1000, {waitingFor: 'ares taking hera\'s castle', until: async function() {
        var heraPlayer = await sim.player('hera');
        return heraPlayer && heraPlayer.lord == (await sim.player('ares'))._id && battleOver(sim, at.castle);
      }});
      await sim.advance(5 * 60 * 1000);
    }},

    {name: 'a lord\'s army defends its new vassal\'s castle', run: async function(sim) {
      await march(sim, 'zeus', {footmen: 80, archers: 20, cavalry: 20}, at.castle);
      await sim.advance(8 * 60 * 60 * 1000, {waitingFor: 'the battle for hera\'s castle', until: async function() {
        var battles = await Battles2.find({gameId: sim.gameId, x: at.castle.x, y: at.castle.y}).fetchAsync();
        return battles.length == 2 && _.every(battles, function(b) { return b.isOver; });
      }});
      await sim.advance(5 * 60 * 1000);
    }}
  ];

  var resultsDir = function() { return repoPath('.test-results/battles'); };

  var play = async function() {
    at = {};
    var sim = await dTest.simulation({seed: SEED, startAt: START_AT, dumpDir: resultsDir()});
    try {
      await dTest.eachAsync(SCENARIO, async function(step) {
        await step.run(sim);
        await sim.endStep(step.name, facts);
      });
      return {steps: sim.steps, at: _.clone(at)};
    } finally {
      await sim.finish();
    }
  };

  Meteor.startup(function() {
    dTest.addSuite('battles (server/battleTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;

      if (process.env.DOMINUS_WORKER != 'true') {
        await run('battles: needs the worker', function() { return 'skip'; });
        return;
      }

      var played = null;
      var playedError = null;
      var playOnce = async function() {
        if (playedError) throw playedError;
        if (played) return played;
        try {
          played = await play();
          var record = {
            about: 'What the battles test (server/battleTests.js) left behind after each step. ' +
              'Recorded from the code before the battle job became async; see that file before recording it again.',
            seed: SEED,
            startAt: START_AT.toISOString(),
            at: played.at,
            steps: played.steps
          };
          fs.writeFileSync(path.join(resultsDir(), 'actual.json'), JSON.stringify(record, null, 1) + '\n');
          return played;
        } catch (e) {
          playedError = e;
          throw e;
        }
      };

      var stepFacts = async function(name) {
        return _.findWhere((await playOnce()).steps, {step: name}).facts;
      };
      var battleFacts = async function(name, where) {
        return _.findWhere((await stepFacts(name)).battles, {x: where.x, y: where.y});
      };

      await run('battles: every battle plays out, no job fails and the invariants hold', async function() {
        var steps = (await playOnce()).steps;
        equal(steps.length, SCENARIO.length, 'every step played');
        equal(_.flatten(_.map(steps, function(s) { return s.jobs.failed; })).join('; '), '', 'no job failed');
        equal(_.flatten(_.map(steps, function(s) { return s.invariantProblems; })).join('; '), '', 'invariant problems');
      });

      await run('battles: two armies in the open fight until one is destroyed', async function() {
        var where = (await playOnce()).at.open;
        var battle = await battleFacts('two armies meet in the open', where);
        assert(battle && battle.isOver, 'the battle is over');
        assert(battle.rounds > 1, 'it took more than one round: ' + battle.rounds);
        equal(JSON.stringify(battle.units), JSON.stringify(['sim_hera army destroyed', 'sim_ares army']), 'hera\'s army was destroyed');
        var players = (await stepFacts('two armies meet in the open')).players;
        equal(_.filter(players.sim_hera.armies, function(a) { return a.x == where.x && a.y == where.y; }).length, 0, 'and is gone');
        assert(players.sim_hera.alerts.armyDestroyed >= 1, 'hera was told her army was destroyed');
        assert(players.sim_ares.alerts.battleStart >= 1 && players.sim_hera.alerts.battleStart >= 1, 'both were told the battle started');
        assert(_.reduce(_.values(players.sim_ares.losses), function(s, n) { return s + n; }, 0) > 0, 'ares lost soldiers too');
      });

      await run('battles: a village is destroyed', async function() {
        var where = (await playOnce()).at.village;
        var battle = await battleFacts('an army burns a village', where);
        assert(battle && battle.isOver, 'the battle is over');
        equal(JSON.stringify(battle.units), JSON.stringify(['sim_hera village destroyed', 'sim_ares army']), 'the village was destroyed');
        var players = (await stepFacts('an army burns a village')).players;
        equal(players.sim_hera.villages.length, 0, 'hera has no village');
        assert(players.sim_hera.alerts.villageDestroyed == 1, 'hera was told her village was destroyed');
        var hex = await Hexes.findOneAsync({x: where.x, y: where.y}, {fields: {hasBuilding: 1}});
        assert(!hex || !hex.hasBuilding, 'its hex is free');
      });

      await run('battles: an army takes a capital', async function() {
        var where = (await playOnce()).at.capital;
        var battle = await battleFacts('an army takes a capital', where);
        assert(battle && battle.isOver, 'the battle is over');
        assert(_.contains(battle.units, 'sim_ares army took the capital'), 'ares took the capital: ' + battle.units.join(', '));
        var capital = _.findWhere((await stepFacts('an army takes a capital')).capitals, {x: where.x, y: where.y});
        equal(capital.owner, 'sim_ares', 'the capital is ares\'s');
        equal((await stepFacts('an army takes a capital')).players.sim_ares.alerts.capturedCapital, 1, 'and he was told');
      });

      await run('battles: an army takes a castle, and its owner becomes a vassal', async function() {
        var where = (await playOnce()).at.castle;
        var name = 'an army takes a castle';
        var battle = await battleFacts(name, where);
        assert(battle && battle.isOver, 'the battle is over');
        assert(_.contains(battle.units, 'sim_hera castle destroyed'), 'the castle fell: ' + battle.units.join(', '));
        assert(_.contains(battle.units, 'sim_ares army took the castle'), 'ares took it');
        var players = (await stepFacts(name)).players;
        equal(players.sim_hera.lord, 'sim_ares', 'hera is ares\'s vassal');
        equal(JSON.stringify(players.sim_ares.vassals), JSON.stringify(['sim_hera']), 'and ares her lord');
        assert(_.some(players.sim_ares.armies, function(a) { return a.x == where.x && a.y == where.y && a.onAllyBuilding; }),
          'ares\'s army stays on the castle, an ally\'s building now');
      });

      await run('battles: a lord\'s army defends its vassal\'s castle, and the lord is told', async function() {
        var where = (await playOnce()).at.castle;
        var name = 'a lord\'s army defends its new vassal\'s castle';
        var battles = (await stepFacts(name)).battles.filter(function(b) { return b.x == where.x && b.y == where.y; });
        equal(battles.length, 2, 'a second battle at hera\'s castle');
        var battle = _.last(battles);
        assert(battle.isOver, 'it is over');
        assert(_.contains(battle.units, 'sim_ares army') || _.contains(battle.units, 'sim_ares army destroyed'), 'ares\'s army fought: ' + battle.units.join(', '));
        assert(_.contains(battle.units, 'sim_hera castle') || _.contains(battle.units, 'sim_hera castle destroyed'), 'with hera\'s castle: ' + battle.units.join(', '));
        assert(_.contains(battle.units, 'sim_zeus army destroyed'), 'and beat zeus: ' + battle.units.join(', '));
        equal((await stepFacts(name)).players.sim_hera.lord, 'sim_ares', 'hera is still ares\'s vassal');
        var before = (await stepFacts('an army takes a castle')).players.sim_ares.alerts.vassalIsUnderAttack || 0;
        assert(((await stepFacts(name)).players.sim_ares.alerts.vassalIsUnderAttack || 0) > before, 'ares was told his vassal is under attack');
      });

      await run('battles: every step matches the battles recorded before (tests/golden/battles.json)', async function() {
        var result = await playOnce();
        var goldenFile = repoPath(GOLDEN);
        if (!fs.existsSync(goldenFile)) {
          throw new Error('FAIL: no ' + GOLDEN + ' to compare with (record it from ' + path.join(resultsDir(), 'actual.json') + ')');
        }
        var golden = JSON.parse(fs.readFileSync(goldenFile, 'utf8'));
        equal(golden.seed, SEED, 'recorded with the same seed');
        equal(JSON.stringify(golden.at), JSON.stringify(result.at), 'at the same places');
        var changes = dTest.compareSimulation(golden.steps, JSON.parse(JSON.stringify(result.steps)));
        if (changes.length) {
          throw new Error('FAIL: the battles went differently from ' + GOLDEN + '. The documents of each step are in ' + resultsDir() +
            '.\n' + changes.slice(0, 6).join('\n'));
        }
      });
    });
  });
}
