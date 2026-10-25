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
  var freeHexNear = function(sim, x, y, opts) {
    opts = opts || {};
    var buildings = [];
    [Castles, Villages, Capitals].forEach(function(c) {
      c.find({gameId: sim.gameId}, {fields: {x: 1, y: 1}}).forEach(function(b) { buildings.push(b); });
    });
    var find = {gameId: sim.gameId, hasBuilding: {$ne: true}};
    if (opts.type) find.type = opts.type;
    var hexes = Hexes.find(find, {sort: {x: 1, y: 1}}).fetch();
    hexes = _.filter(hexes, function(h) {
      return Mapmaker.coordsToCountryId(sim.gameId, h.x, h.y) &&
        !_.some(buildings, function(b) { return hexDistance(b.x, b.y, h.x, h.y) < 2; }) &&
        !_.some(opts.not || [], function(n) { return n.x == h.x && n.y == h.y; });
    });
    if (!hexes.length) throw new Error('FAIL: no free hex near ' + x + ',' + y);
    var hex = _.min(hexes, function(h) { return hexDistance(x, y, h.x, h.y); });
    return {x: hex.x, y: hex.y};
  };

  var armiesOf = function(sim, name) {
    return Armies.find({gameId: sim.gameId, user_id: sim.users[name]._id}, {sort: {_id: 1}}).fetch();
  };

  // hires soldiers at the player's castle and marches them to (x, y); returns the army
  var march = function(sim, name, values, to) {
    var castle = sim.castle(name);
    var before = _.pluck(armiesOf(sim, name), '_id');
    sim.call(name, 'hireArmy', sim.gameId, soldiers(values), castle._id, 'castle');
    sim.call(name, 'createArmyFromBuilding', sim.gameId, 'castle', castle._id, soldiers(values));
    var army = _.find(armiesOf(sim, name), function(a) { return before.indexOf(a._id) == -1; });
    if (!army) throw new Error('FAIL: ' + name + '\'s army was not made');
    if (to) sim.call(name, 'addArmyPath', sim.gameId, to.x, to.y, army._id);
    return army;
  };

  var arrived = function(armyId, to) {
    var army = Armies.findOne(armyId);
    return army && army.x == to.x && army.y == to.y && !Armypaths.findOne({armyId: armyId});
  };

  var battleAt = function(sim, at) {
    return Battles2.findOne({gameId: sim.gameId, x: at.x, y: at.y}, {sort: {createdAt: -1}});
  };

  // the battle at (at) is over
  var battleOver = function(sim, at) {
    var battle = battleAt(sim, at);
    return battle && battle.isOver;
  };

  var power = function(n) { return Math.round(n * 1000) / 1000; };

  // What each step is about, in words, so the golden file can be read and a
  // change shows up as more than a hash.
  var facts = function(sim) {
    var out = {battles: [], players: {}, capitals: []};
    Battles2.find({gameId: sim.gameId}, {sort: {createdAt: 1, x: 1, y: 1}}).forEach(function(b) {
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
    Players.find({gameId: sim.gameId}, {sort: {username: 1}}).forEach(function(p) {
      var castle = Castles.findOne(p.castle_id);
      var alerts = {};
      Alerts.find({gameId: sim.gameId, 'playerIds.playerId': p._id}).forEach(function(a) { var type = a.type.replace(/^alert_/, ''); alerts[type] = (alerts[type] || 0) + 1; });
      out.players[p.username] = {
        lord: sim.nameOf(p.lord),
        vassals: _.map(p.vassals, sim.nameOf).sort(),
        losses: p.losses,
        castle: castle && _.pick(castle, _s.armies.types),
        armies: Armies.find({playerId: p._id}, {sort: {_id: 1}}).map(function(a) {
          return _.extend({x: a.x, y: a.y, onAllyBuilding: a.onAllyBuilding}, _.pick(a, _s.armies.types));
        }),
        villages: Villages.find({playerId: p._id}, {sort: {_id: 1}}).map(function(v) { return _.extend({x: v.x, y: v.y}, _.pick(v, _s.armies.types)); }),
        alerts: alerts
      };
    });
    Capitals.find({gameId: sim.gameId}, {sort: {x: 1, y: 1}}).forEach(function(c) {
      out.capitals.push(_.extend({x: c.x, y: c.y, owner: sim.nameOf(c.playerId)}, _.pick(c, _s.armies.types)));
    });
    return out;
  };

  // where the scenario's battles are, filled in as it plays
  var at = {};

  var SCENARIO = [

    {name: 'three players sign up and the game starts', run: function(sim) {
      NAMES.forEach(function(name) {
        sim.addUser(name, {emails: [{address: 'sim_' + name + '@example.com', verified: true}]});
      });
      var game = dTest.helpers.createTestGame({name: 'Battles', startAt: dClock.now(), createdAt: dClock.now()});
      sim.gameId = game._id;
      NAMES.forEach(function(name) {
        var user = sim.users[name];
        Gamesignups.insert({gameId: game._id, userId: user._id, username: user.username, createdAt: dClock.now(), usedToken: false});
      });
      sim.advance(2 * 60 * 1000);
      NAMES.forEach(function(name) {
        Players.update(sim.player(name)._id, {$inc: {gold: 5000, grain: 30000, lumber: 20000, ore: 50000, wool: 20000, clay: 5000, glass: 2000}});
      });
    }},

    {name: 'two armies meet in the open', run: function(sim) {
      var hera = sim.castle('hera');
      at.open = freeHexNear(sim, hera.x, hera.y);
      var heras = march(sim, 'hera', {footmen: 60, archers: 20}, at.open);
      sim.advance(3 * 60 * 60 * 1000, {waitingFor: 'hera\'s army reaching the field', until: function() { return arrived(heras._id, at.open); }});
      march(sim, 'ares', {footmen: 100, archers: 30, cavalry: 30}, at.open);
      sim.advance(6 * 60 * 60 * 1000, {waitingFor: 'the battle in the open', until: function() { return battleOver(sim, at.open); }});
      sim.advance(5 * 60 * 1000);
    }},

    {name: 'an army burns a village', run: function(sim) {
      var hera = sim.castle('hera');
      at.village = freeHexNear(sim, hera.x, hera.y, {type: 'grain', not: [at.open]});
      var builder = march(sim, 'hera', {footmen: 10}, at.village);
      sim.advance(3 * 60 * 60 * 1000, {waitingFor: 'hera reaching the grain hex', until: function() { return arrived(builder._id, at.village); }});
      sim.call('hera', 'buildVillage', sim.gameId, at.village.x, at.village.y);
      var built = function() { var v = Villages.findOne({playerId: sim.player('hera')._id}); return v && !v.under_construction; };
      sim.advance(2 * 60 * 60 * 1000, {waitingFor: 'hera\'s village being built', until: built});
      var attacker = _.max(armiesOf(sim, 'ares'), function(a) { return a.footmen; });
      sim.call('ares', 'addArmyPath', sim.gameId, at.village.x, at.village.y, attacker._id);
      sim.advance(6 * 60 * 60 * 1000, {waitingFor: 'the battle at the village', until: function() { return battleOver(sim, at.village); }});
      sim.advance(5 * 60 * 1000);
    }},

    {name: 'an army takes a capital', run: function(sim) {
      var ares = sim.castle('ares');
      var capital = _.min(Capitals.find({gameId: sim.gameId}, {sort: {x: 1, y: 1}}).fetch(), function(c) { return hexDistance(ares.x, ares.y, c.x, c.y); });
      at.capital = {x: capital.x, y: capital.y};
      march(sim, 'ares', {footmen: 120, archers: 40, cavalry: 40}, at.capital);
      sim.advance(8 * 60 * 60 * 1000, {waitingFor: 'the battle at the capital', until: function() { return battleOver(sim, at.capital); }});
      sim.advance(5 * 60 * 1000);
    }},

    {name: 'an army takes a castle', run: function(sim) {
      var hera = sim.castle('hera');
      at.castle = {x: hera.x, y: hera.y};
      // made in her castle's hex, hera's army joins the castle
      march(sim, 'hera', {footmen: 20, pikemen: 10});
      march(sim, 'ares', {footmen: 150, archers: 50, cavalry: 60, catapults: 10}, at.castle);
      sim.advance(8 * 60 * 60 * 1000, {waitingFor: 'ares taking hera\'s castle', until: function() {
        var heraPlayer = sim.player('hera');
        return heraPlayer && heraPlayer.lord == sim.player('ares')._id && battleOver(sim, at.castle);
      }});
      sim.advance(5 * 60 * 1000);
    }},

    {name: 'a lord\'s army defends its new vassal\'s castle', run: function(sim) {
      march(sim, 'zeus', {footmen: 80, archers: 20, cavalry: 20}, at.castle);
      sim.advance(8 * 60 * 60 * 1000, {waitingFor: 'the battle for hera\'s castle', until: function() {
        var battles = Battles2.find({gameId: sim.gameId, x: at.castle.x, y: at.castle.y}).fetch();
        return battles.length == 2 && _.every(battles, function(b) { return b.isOver; });
      }});
      sim.advance(5 * 60 * 1000);
    }}
  ];

  var resultsDir = function() { return repoPath('.test-results/battles'); };

  var play = function() {
    at = {};
    var sim = dTest.simulation({seed: SEED, startAt: START_AT, dumpDir: resultsDir()});
    try {
      SCENARIO.forEach(function(step) {
        step.run(sim);
        sim.endStep(step.name, facts);
      });
      return {steps: sim.steps, at: _.clone(at)};
    } finally {
      sim.finish();
    }
  };

  Meteor.startup(function() {
    dTest.addSuite('battles (server/battleTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;

      if (process.env.DOMINUS_WORKER != 'true') {
        run('battles: needs the worker', function() { return 'skip'; });
        return;
      }

      var played = null;
      var playedError = null;
      var playOnce = function() {
        if (playedError) throw playedError;
        if (played) return played;
        try {
          played = play();
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

      var stepFacts = function(name) {
        return _.findWhere(playOnce().steps, {step: name}).facts;
      };
      var battleFacts = function(name, where) {
        return _.findWhere(stepFacts(name).battles, {x: where.x, y: where.y});
      };

      run('battles: every battle plays out, no job fails and the invariants hold', function() {
        var steps = playOnce().steps;
        equal(steps.length, SCENARIO.length, 'every step played');
        equal(_.flatten(_.map(steps, function(s) { return s.jobs.failed; })).join('; '), '', 'no job failed');
        equal(_.flatten(_.map(steps, function(s) { return s.invariantProblems; })).join('; '), '', 'invariant problems');
      });

      run('battles: two armies in the open fight until one is destroyed', function() {
        var where = playOnce().at.open;
        var battle = battleFacts('two armies meet in the open', where);
        assert(battle && battle.isOver, 'the battle is over');
        assert(battle.rounds > 1, 'it took more than one round: ' + battle.rounds);
        equal(JSON.stringify(battle.units), JSON.stringify(['sim_hera army destroyed', 'sim_ares army']), 'hera\'s army was destroyed');
        var players = stepFacts('two armies meet in the open').players;
        equal(_.filter(players.sim_hera.armies, function(a) { return a.x == where.x && a.y == where.y; }).length, 0, 'and is gone');
        assert(players.sim_hera.alerts.armyDestroyed >= 1, 'hera was told her army was destroyed');
        assert(players.sim_ares.alerts.battleStart >= 1 && players.sim_hera.alerts.battleStart >= 1, 'both were told the battle started');
        assert(_.reduce(_.values(players.sim_ares.losses), function(s, n) { return s + n; }, 0) > 0, 'ares lost soldiers too');
      });

      run('battles: a village is destroyed', function() {
        var where = playOnce().at.village;
        var battle = battleFacts('an army burns a village', where);
        assert(battle && battle.isOver, 'the battle is over');
        equal(JSON.stringify(battle.units), JSON.stringify(['sim_hera village destroyed', 'sim_ares army']), 'the village was destroyed');
        var players = stepFacts('an army burns a village').players;
        equal(players.sim_hera.villages.length, 0, 'hera has no village');
        assert(players.sim_hera.alerts.villageDestroyed == 1, 'hera was told her village was destroyed');
        var hex = Hexes.findOne({x: where.x, y: where.y}, {fields: {hasBuilding: 1}});
        assert(!hex || !hex.hasBuilding, 'its hex is free');
      });

      run('battles: an army takes a capital', function() {
        var where = playOnce().at.capital;
        var battle = battleFacts('an army takes a capital', where);
        assert(battle && battle.isOver, 'the battle is over');
        assert(_.contains(battle.units, 'sim_ares army took the capital'), 'ares took the capital: ' + battle.units.join(', '));
        var capital = _.findWhere(stepFacts('an army takes a capital').capitals, {x: where.x, y: where.y});
        equal(capital.owner, 'sim_ares', 'the capital is ares\'s');
        equal(stepFacts('an army takes a capital').players.sim_ares.alerts.capturedCapital, 1, 'and he was told');
      });

      run('battles: an army takes a castle, and its owner becomes a vassal', function() {
        var where = playOnce().at.castle;
        var name = 'an army takes a castle';
        var battle = battleFacts(name, where);
        assert(battle && battle.isOver, 'the battle is over');
        assert(_.contains(battle.units, 'sim_hera castle destroyed'), 'the castle fell: ' + battle.units.join(', '));
        assert(_.contains(battle.units, 'sim_ares army took the castle'), 'ares took it');
        var players = stepFacts(name).players;
        equal(players.sim_hera.lord, 'sim_ares', 'hera is ares\'s vassal');
        equal(JSON.stringify(players.sim_ares.vassals), JSON.stringify(['sim_hera']), 'and ares her lord');
        assert(_.some(players.sim_ares.armies, function(a) { return a.x == where.x && a.y == where.y && a.onAllyBuilding; }),
          'ares\'s army stays on the castle, an ally\'s building now');
      });

      run('battles: a lord\'s army defends its vassal\'s castle, and the lord is told', function() {
        var where = playOnce().at.castle;
        var name = 'a lord\'s army defends its new vassal\'s castle';
        var battles = stepFacts(name).battles.filter(function(b) { return b.x == where.x && b.y == where.y; });
        equal(battles.length, 2, 'a second battle at hera\'s castle');
        var battle = _.last(battles);
        assert(battle.isOver, 'it is over');
        assert(_.contains(battle.units, 'sim_ares army') || _.contains(battle.units, 'sim_ares army destroyed'), 'ares\'s army fought: ' + battle.units.join(', '));
        assert(_.contains(battle.units, 'sim_hera castle') || _.contains(battle.units, 'sim_hera castle destroyed'), 'with hera\'s castle: ' + battle.units.join(', '));
        assert(_.contains(battle.units, 'sim_zeus army destroyed'), 'and beat zeus: ' + battle.units.join(', '));
        equal(stepFacts(name).players.sim_hera.lord, 'sim_ares', 'hera is still ares\'s vassal');
        var before = stepFacts('an army takes a castle').players.sim_ares.alerts.vassalIsUnderAttack || 0;
        assert((stepFacts(name).players.sim_ares.alerts.vassalIsUnderAttack || 0) > before, 'ares was told his vassal is under attack');
      });

      run('battles: every step matches the battles recorded before (tests/golden/battles.json)', function() {
        var result = playOnce();
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
