// The game simulation (T6b of the Meteor upgrade plan, Oct 2026).
//
// Four players play one whole game, from sign up to the game closing, on a
// fixed game clock with seeded random numbers (server/lib/testRunnerSimulation.js).
// After each step of the scenario the test checks the game's invariants and
// compares every document the game wrote with tests/golden/simulation.json,
// which was recorded from the code as it was before the Meteor upgrade. An
// upgrade that changes what the game does changes a hash there.
//
// When a change to the game is meant to change what it does, record the
// golden file again: each run writes what it got to
// .test-results/simulation/actual.json and every step's documents to
// .test-results/simulation/step-NN.json; run once on the branch before the
// change and once after, diff the step files to check the change did what it
// should and nothing else, then copy actual.json over tests/golden/simulation.json.
//
// It runs as part of runAllTests (server/lib/testRunner.js), so the same rule
// applies: only against a local development database.

if (Meteor.isServer) {

  var fs = Npm.require('fs');
  var path = Npm.require('path');

  var SEED = 'dominus golden master';
  var START_AT = new Date(Date.UTC(2026, 0, 5, 9, 0, 0));
  var NAMES = ['alice', 'bob', 'carol', 'dave'];

  var soldiers = function(values) { return dTest.soldierCounts(values); };

  // hexes between two hexes (x, y, and z = -x - y)
  var hexDistance = function(x1, y1, x2, y2) {
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs((x1 + y1) - (x2 + y2)));
  };

  // a free grain hex next to (x, y), nearest first, then by x and y
  var grainHexNear = function(sim, x, y) {
    var taken = {};
    Castles.find({gameId: sim.gameId}).forEach(function(c) { taken[c.x + '_' + c.y] = true; });
    Villages.find({gameId: sim.gameId}).forEach(function(v) { taken[v.x + '_' + v.y] = true; });
    var hexes = Hexes.find({gameId: sim.gameId, type: 'grain', hasBuilding: {$ne: true}}, {sort: {x: 1, y: 1}}).fetch();
    hexes = _.reject(hexes, function(h) { return taken[h.x + '_' + h.y]; });
    var hex = _.min(hexes, function(h) { return hexDistance(x, y, h.x, h.y); });
    if (!hex || hex === Infinity) throw new Error('FAIL: no free grain hex');
    return {x: hex.x, y: hex.y};
  };

  // the player's biggest army, or null
  var mainArmy = function(sim, name) {
    var armies = Armies.find({gameId: sim.gameId, user_id: sim.users[name]._id}, {sort: {_id: 1}}).fetch();
    if (!armies.length) return null;
    return _.max(armies, function(a) { return _.reduce(_s.armies.types, function(sum, t) { return sum + a[t]; }, 0); });
  };

  var lordOf = function(sim, name) {
    var player = sim.player(name);
    return player && sim.nameOf(player.lord);
  };

  // What a step is about, in words, so the golden file can be read and a
  // change shows up as something more than a hash.
  var facts = function(sim) {
    var game = Games.findOne(sim.gameId);
    var out = {
      game: game && {
        hasStarted: game.hasStarted, hasEnded: game.hasEnded, hasClosed: game.hasClosed,
        dominusAchieved: game.dominusAchieved, lastDominus: sim.nameOf(game.lastDominusPlayerId),
        winner: game.winningPlayer && game.winningPlayer.username,
        endDate: game.endDate, closeDate: game.closeDate, taxesCollected: game.taxesCollected
      },
      players: {},
      battles: Battles2.find({gameId: sim.gameId}).map(function(b) { return _.pick(b, 'x', 'y', 'isOver', 'roundNumber'); }),
      markets: Market.find({gameId: sim.gameId}, {sort: {type: 1}}).map(function(m) { return _.pick(m, 'type', 'price', 'quantity'); }),
      alerts: Alerts.find({gameId: sim.gameId}).count(),
      globalAlerts: GlobalAlerts.find({gameId: sim.gameId}).count(),
      reports: Reports.find({gameId: sim.gameId}).count()
    };
    Players.find({gameId: sim.gameId}, {sort: {username: 1}}).forEach(function(p) {
      var castle = Castles.findOne(p.castle_id);
      out.players[p.username] = {
        lord: sim.nameOf(p.lord),
        king: sim.nameOf(p.king),
        vassals: _.map(p.vassals, sim.nameOf).sort(),
        is_king: p.is_king,
        is_dominus: p.is_dominus,
        wonGame: p.wonGame,
        resources: _.pick(p, _s.market.types_plus_gold),
        income: p.income,
        castle: castle && _.extend({x: castle.x, y: castle.y}, _.pick(castle, _s.armies.types)),
        armies: Armies.find({playerId: p._id}, {sort: {_id: 1}}).map(function(a) {
          return _.extend({x: a.x, y: a.y}, _.pick(a, _s.armies.types));
        }),
        villages: Villages.find({playerId: p._id}, {sort: {_id: 1}}).map(function(v) {
          return {x: v.x, y: v.y, level: v.level, under_construction: v.under_construction};
        })
      };
    });
    return out;
  };

  // The scenario, one step after another. Each step acts, moves the game
  // clock on and ends with sim.endStep.
  var SCENARIO = [

    {name: 'four players sign up and the game starts', run: function(sim) {
      NAMES.forEach(function(name) {
        sim.addUser(name, {emails: [{address: 'sim_' + name + '@example.com', verified: true}]});
      });
      var game = dTest.helpers.createTestGame({name: 'Simulation', startAt: dClock.now(), createdAt: dClock.now()});
      sim.gameId = game._id;
      NAMES.forEach(function(name) {
        var user = sim.users[name];
        Gamesignups.insert({gameId: game._id, userId: user._id, username: user.username, createdAt: dClock.now(), usedToken: false});
      });
      sim.advance(2 * 60 * 1000);
    }},

    {name: 'everyone trades at the market and hires soldiers', run: function(sim) {
      // a war chest, so the attacks are big enough to take a castle
      NAMES.forEach(function(name) {
        Players.update(sim.player(name)._id, {$inc: {gold: 2000, grain: 5000, lumber: 2000, ore: 8000, wool: 4000, clay: 2000, glass: 500}});
      });
      sim.call('alice', 'buy_resource', sim.gameId, 'ore', 50);
      sim.call('bob', 'sell_resource', sim.gameId, 'grain', 300);
      sim.call('carol', 'buy_resource', sim.gameId, 'wool', 20);
      sim.call('dave', 'sell_resource', sim.gameId, 'lumber', 200);

      sim.call('alice', 'hireArmy', sim.gameId, soldiers({footmen: 60, cavalry: 30}), sim.castle('alice')._id, 'castle');
      sim.call('bob', 'hireArmy', sim.gameId, soldiers({pikemen: 10}), sim.castle('bob')._id, 'castle');
      sim.call('carol', 'hireArmy', sim.gameId, soldiers({footmen: 50, cavalry: 25}), sim.castle('carol')._id, 'castle');
      sim.call('dave', 'hireArmy', sim.gameId, soldiers({archers: 10}), sim.castle('dave')._id, 'castle');
      sim.advance(60 * 1000);
    }},

    {name: 'alice marches on bob and carol on dave', run: function(sim) {
      ['alice', 'carol'].forEach(function(name) {
        sim.call(name, 'createArmyFromBuilding', sim.gameId, 'castle', sim.castle(name)._id, soldiers({footmen: 50, cavalry: 25}));
      });
      sim.call('alice', 'addArmyPath', sim.gameId, sim.castle('bob').x, sim.castle('bob').y, mainArmy(sim, 'alice')._id);
      sim.call('carol', 'addArmyPath', sim.gameId, sim.castle('dave').x, sim.castle('dave').y, mainArmy(sim, 'carol')._id);
      sim.advance(10 * 60 * 1000);
    }},

    {name: 'carol takes dave\'s castle', run: function(sim) {
      sim.advance(4 * 60 * 60 * 1000, {waitingFor: 'carol taking dave\'s castle', until: function() { return lordOf(sim, 'dave') == 'sim_carol'; }});
    }},

    {name: 'alice takes bob\'s castle', run: function(sim) {
      sim.advance(4 * 60 * 60 * 1000, {waitingFor: 'alice taking bob\'s castle', until: function() { return lordOf(sim, 'bob') == 'sim_alice'; }});
      sim.advance(5 * 60 * 1000);
    }},

    {name: 'alice sends her vassal gold, and bob builds a village and upgrades it', run: function(sim) {
      sim.call('alice', 'send_gold_to', sim.gameId, sim.player('bob')._id, 300);
      sim.call('bob', 'hireArmy', sim.gameId, soldiers({footmen: 6}), sim.castle('bob')._id, 'castle');
      sim.call('bob', 'createArmyFromBuilding', sim.gameId, 'castle', sim.castle('bob')._id, soldiers({footmen: 4}));
      var castle = sim.castle('bob');
      var hex = grainHexNear(sim, castle.x, castle.y);
      sim.call('bob', 'addArmyPath', sim.gameId, hex.x, hex.y, mainArmy(sim, 'bob')._id);
      sim.advance(3 * 60 * 60 * 1000, {waitingFor: 'bob reaching the grain hex', until: function() {
        var army = mainArmy(sim, 'bob');
        return army && army.x == hex.x && army.y == hex.y && !Armypaths.findOne({armyId: army._id});
      }});
      sim.call('bob', 'buildVillage', sim.gameId, hex.x, hex.y);
      var built = function() { var v = Villages.findOne({playerId: sim.player('bob')._id}); return v && !v.under_construction; };
      sim.advance(2 * 60 * 60 * 1000, {waitingFor: 'bob\'s village being built', until: built});
      sim.call('bob', 'upgradeVillage', sim.gameId, Villages.findOne({playerId: sim.player('bob')._id})._id);
      sim.advance(30 * 60 * 1000, {step: 60 * 1000});
    }},

    {name: 'carol splits her army and sends half home, alice\'s first army goes home', run: function(sim) {
      var army = mainArmy(sim, 'carol');
      sim.call('carol', 'splitArmy', sim.gameId, army._id, {footmen: 10, cavalry: 2});
      sim.call('carol', 'armies.returnToCastle', {armyId: army._id});
      sim.call('alice', 'armies.returnToCastle', {armyId: mainArmy(sim, 'alice')._id});
      sim.advance(3 * 60 * 60 * 1000, {waitingFor: 'the armies getting home', until: function() {
        return !Armypaths.findOne({gameId: sim.gameId});
      }});
      Armies.find({gameId: sim.gameId, user_id: {$in: [sim.users.alice._id, sim.users.carol._id]}}, {sort: {_id: 1}}).forEach(function(a) {
        var owner = a.user_id == sim.users.alice._id ? 'alice' : 'carol';
        var castle = sim.castle(owner);
        if (a.x == castle.x && a.y == castle.y) {
          sim.call(owner, 'armies.joinBuilding', {armyId: a._id});
        }
      });
      sim.advance(5 * 60 * 1000);
    }},

    {name: 'alice takes carol\'s castle and becomes dominus', run: function(sim) {
      sim.call('alice', 'hireArmy', sim.gameId, soldiers({footmen: 40, cavalry: 20}), sim.castle('alice')._id, 'castle');
      var castle = sim.castle('alice');
      sim.call('alice', 'createArmyFromBuilding', sim.gameId, 'castle', castle._id, soldiers({footmen: castle.footmen, cavalry: castle.cavalry}));
      sim.call('alice', 'addArmyPath', sim.gameId, sim.castle('carol').x, sim.castle('carol').y, mainArmy(sim, 'alice')._id);
      sim.advance(6 * 60 * 60 * 1000, {waitingFor: 'alice becoming dominus', until: function() {
        var alice = sim.player('alice');
        return alice && alice.is_dominus;
      }});
      sim.advance(10 * 60 * 1000);
    }},

    {name: 'the game ends two days later', run: function(sim) {
      sim.advance(3 * 24 * 60 * 60 * 1000, {step: 10 * 60 * 1000, waitingFor: 'the game ending', until: function() {
        return Games.findOne(sim.gameId).hasEnded;
      }});
    }},

    {name: 'the game closes three days after that', run: function(sim) {
      sim.advance(4 * 24 * 60 * 60 * 1000, {step: 30 * 60 * 1000, waitingFor: 'the game closing', until: function() {
        return Games.findOne(sim.gameId).hasClosed;
      }});
    }}
  ];

  // Invariant problems the game has today. Each is a bug: fixing one means
  // taking it out of here and out of the golden file on purpose.
  var KNOWN_PROBLEMS = [];

  var goldenPath = function() { return path.join(dTest.appDir(), 'tests', 'golden', 'simulation.json'); };
  var resultsDir = function() { return path.join(dTest.appDir(), '.test-results', 'simulation'); };

  var record = function(steps) {
    return {
      about: 'What the game simulation (server/simulationTests.js) left behind after each step. ' +
        'Recorded from the code before the Meteor upgrade; see that file before recording it again.',
      seed: SEED,
      startAt: START_AT.toISOString(),
      steps: steps
    };
  };

  // where two values differ, as paths like players.sim_bob.resources.gold
  var differences = function(a, b, at, out) {
    out = out || [];
    at = at || '';
    if (out.length >= 12) return out;
    if (_.isObject(a) && _.isObject(b) && _.isArray(a) == _.isArray(b)) {
      _.union(_.keys(a), _.keys(b)).forEach(function(key) {
        differences(a[key], b[key], at ? at + '.' + key : key, out);
      });
    } else if (!_.isEqual(a, b)) {
      out.push(at + ': ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b));
    }
    return out;
  };

  // Compares the steps with expected ones; returns the differences, the first
  // differing steps first.
  dTest.compareSimulation = function(expected, actual) {
    var out = [];
    if (expected.length != actual.length) out.push(expected.length + ' steps expected, ' + actual.length + ' played');
    _.zip(expected, actual).forEach(function(pair, n) {
      var e = pair[0] || {}, a = pair[1] || {};
      if (_.isEqual(e, a)) return;
      var changed = _.filter(_.union(_.keys(e.collections || {}), _.keys(a.collections || {})), function(c) {
        return !_.isEqual((e.collections || {})[c], (a.collections || {})[c]);
      });
      var detail = differences(_.omit(e, 'collections'), _.omit(a, 'collections'));
      out.push('step ' + (n + 1) + ' (' + (a.step || e.step) + '): documents changed in [' + changed.join(', ') + ']' +
        (detail.length ? '; ' + detail.join('; ') : ''));
    });
    return out;
  };

  dTest.simulationScenario = SCENARIO;

  // Plays the first `steps` steps of the scenario (all of them by default)
  // and returns the steps' records. opts.before(sim) runs first; opts.keep
  // leaves the documents in the database.
  dTest.playSimulation = function(opts) {
    opts = opts || {};
    var sim = dTest.simulation({seed: SEED, startAt: START_AT, dumpDir: opts.dumpDir});
    try {
      if (opts.before) opts.before(sim);
      SCENARIO.slice(0, opts.steps || SCENARIO.length).forEach(function(step, n) {
        step.run(sim);
        sim.endStep(step.name, facts);
        if (opts.onStep) opts.onStep(sim, n);
      });
      return sim.steps;
    } finally {
      sim.finish(opts.keep);
    }
  };


  Meteor.startup(function() {
    dTest.addSuite('game simulation (server/simulationTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;

      if (process.env.DOMINUS_WORKER != 'true') {
        run('simulation: needs the worker', function() { return 'skip'; });
        return;
      }

      var played = null;
      var playedError = null;

      // the whole game, played once, its documents written to .test-results
      var playOnce = function() {
        if (played || playedError) {
          if (playedError) throw playedError;
          return played;
        }
        try {
          played = dTest.playSimulation({dumpDir: resultsDir()});
          fs.writeFileSync(path.join(resultsDir(), 'actual.json'), JSON.stringify(record(played), null, 1) + '\n');
          return played;
        } catch (e) {
          playedError = e;
          throw e;
        }
      };

      run('simulation: the whole game plays out, from sign up to the game closing', function() {
        var steps = playOnce();
        equal(steps.length, SCENARIO.length, 'every step played');
        var last = _.last(steps).facts;
        equal(last.game.hasClosed, true, 'the game closed');
        equal(last.game.winner, 'sim_alice', 'alice won');
        equal(JSON.stringify(_.map(NAMES, function(name) { return last.players['sim_' + name].wonGame; })), '[true,false,false,false]', 'only alice won');
        var dominusStep = _.find(steps, function(s) { return s.facts.players.sim_alice && s.facts.players.sim_alice.is_dominus; });
        assert(dominusStep, 'alice became dominus');
        equal(_.flatten(_.map(steps, function(s) { return s.jobs.failed; })).join('; '), '', 'no job failed');
      });

      run('simulation: the invariants hold after every step, but for the known bugs', function() {
        var unexpected = [];
        playOnce().forEach(function(step, n) {
          step.invariantProblems.forEach(function(p) {
            if (!_.some(KNOWN_PROBLEMS, function(known) { return known.test(p); })) unexpected.push('step ' + (n + 1) + ' (' + step.step + '): ' + p);
          });
        });
        equal(unexpected.join('\n'), '', 'invariant problems');
      });

      // was a known bug: create_lord_and_vassal didn't recount the players
      // under the vassal, so dave was counted under one lord until the nightly rebuild
      run('taking a lord recounts num_allies_above for the players under the vassal', function() {
        var steps = playOnce();
        var problemsAt = function(name) { return _.findWhere(steps, {step: name}).invariantProblems; };
        equal(problemsAt('alice takes carol\'s castle and becomes dominus').join('; '), '', 'dave is under carol and alice, and counted under both');
      });

      run('simulation: every step matches the golden master (tests/golden/simulation.json)', function() {
        var steps = playOnce();
        if (!fs.existsSync(goldenPath())) {
          throw new Error('FAIL: no golden file; to record one, copy ' + path.join(resultsDir(), 'actual.json') + ' to ' + goldenPath());
        }
        var golden = JSON.parse(fs.readFileSync(goldenPath(), 'utf8'));
        equal(golden.seed, SEED, 'recorded with the same seed');
        equal(golden.startAt, START_AT.toISOString(), 'and the same start');
        var changes = dTest.compareSimulation(golden.steps, JSON.parse(JSON.stringify(steps)));
        if (changes.length) {
          throw new Error('FAIL: the game played differently from the golden master. The documents of each step are in ' + resultsDir() +
            ' (see the top of server/simulationTests.js).\n' + changes.slice(0, 6).join('\n'));
        }
      });

      run('simulation: a second game, played the same way, is the same down to every document', function() {
        var first = JSON.parse(JSON.stringify(playOnce()));
        var second = JSON.parse(JSON.stringify(dTest.playSimulation()));
        var changes = dTest.compareSimulation(first, second);
        equal(changes.slice(0, 6).join('\n'), '', 'differences between two runs');
      });

      run('simulation: refuses to start while a test has left the game settings changed', function() {
        var max = _s.mapmaker.maxHexesInCountry;
        var e;
        try {
          _s.mapmaker.maxHexesInCountry = 100;
          e = dTest.throws(function() { dTest.playSimulation({steps: 1}); });
        } finally {
          _s.mapmaker.maxHexesInCountry = max;
        }
        assert(e && /_s\.mapmaker\.maxHexesInCountry is 100, was 300/.test(e.message), 'names the setting: ' + (e && e.message));
      });

      run('simulation: a start that fails half way puts back everything it replaced', function() {
        var originals = {add: Queues.add, makeNewID: Players._makeNewID, send: Email.send};
        var createWithSeeds = Random.createWithSeeds;
        var calls = 0;
        var e;
        try {
          // the first call seeds dRandom, the second Players' ids
          Random.createWithSeeds = function() {
            if (++calls == 3) throw new Error('planted failure');
            return createWithSeeds.apply(Random, arguments);
          };
          e = dTest.throws(function() { dTest.playSimulation({steps: 1}); });
        } finally {
          Random.createWithSeeds = createWithSeeds;
        }
        assert(e && e.message == 'planted failure', 'the failure: ' + (e && e.message));
        assert(!dClock.isFixed() && !dRandom.isSeeded(), 'the clock and random numbers are back to normal');
        assert(Players._makeNewID === originals.makeNewID, 'Players ids are back to normal');
        assert(Queues.add === originals.add && Email.send === originals.send, 'Queues.add and Email.send are back');
        assert(!_.some(Queues.queueNames, function(name) { return Queues[name].paused; }), 'Bull is taking jobs again');
      });

      // The two planted bugs show that the golden master and the invariants
      // notice a change: each is put in for one shortened game and taken out
      // again.

      run('simulation: a planted bug that changes the game shows up against the golden master', function() {
        var golden = JSON.parse(fs.readFileSync(goldenPath(), 'utf8'));
        var steps = 2;
        var resourcesToGold = dMarket.resourcesToGold;
        var played;
        try {
          // a player's income is worked out 1% too high
          dMarket.resourcesToGold = function() { return resourcesToGold.apply(this, arguments) * 1.01; };
          played = JSON.parse(JSON.stringify(dTest.playSimulation({steps: steps})));
        } finally {
          dMarket.resourcesToGold = resourcesToGold;
        }
        var changes = dTest.compareSimulation(golden.steps.slice(0, steps), played);
        assert(changes.length, 'the golden master noticed');
        assert(/^step 1 \(.*\): documents changed in \[players, capitals\]/.test(changes[0]), 'in the players and capitals, from the first step: ' + changes[0]);
        assert(/players\.sim_alice\.income: /.test(changes[0]), 'and says it was the income: ' + changes[0]);
        equal(_.flatten(_.pluck(played, 'invariantProblems')).join('; '), '', 'and the invariants can\'t see it');
      });

      run('simulation: a planted change to a battle modifier shows up against the golden master', function() {
        var golden = JSON.parse(fs.readFileSync(goldenPath(), 'utf8'));
        var steps = 4;
        var multiplier = _s.battles.unitBonusMultiplier;
        var played;
        try {
          // after the simulation's check that the settings are as the app started
          played = JSON.parse(JSON.stringify(dTest.playSimulation({steps: steps, before: function() {
            _s.battles.unitBonusMultiplier = multiplier - 0.01;
          }})));
        } finally {
          _s.battles.unitBonusMultiplier = multiplier;
        }
        var changes = dTest.compareSimulation(golden.steps.slice(0, steps), played);
        assert(changes.length, 'the golden master noticed');
        assert(/^step 4 \(carol takes dave's castle\)/.test(changes[0]), 'from the first battles: ' + changes[0]);
        assert(/rounds/.test(changes[0]), 'in the battle rounds: ' + changes[0]);
      });

      run('simulation: a skipped relationship update breaks an invariant', function() {
        var played = dTest.playSimulation({steps: 4, before: function() {
          // the job that recounts vassals after a castle is taken is lost
          var add = Queues.add;
          Queues.add = function(name) {
            if (name != 'updateVassalAllyCountMultiple') return add.apply(this, arguments);
          };
        }});
        var problems = played[3].invariantProblems;
        assert(_.contains(problems, 'num_vassals counts the list: sim_carol has 0, the list has 1'), 'carol\'s vassal is not counted: ' + problems.join('; '));
        assert(_.contains(problems, 'num_allies_above counts the list: sim_dave has 0, the list has 1'), 'nor dave\'s lord: ' + problems.join('; '));
      });

      run('simulation: a planted bug that breaks an invariant is caught', function() {
        var played;
        var buildingAdded = Mapmaker.buildingAdded;
        try {
          // castles are placed without marking their hex as built on
          Mapmaker.buildingAdded = function() {};
          played = dTest.playSimulation({steps: 1});
        } finally {
          Mapmaker.buildingAdded = buildingAdded;
        }
        var problems = played[0].invariantProblems;
        var castles = played[0].facts.players;
        NAMES.forEach(function(name) {
          var castle = castles['sim_' + name].castle;
          assert(_.contains(problems, 'hasBuilding is set where there is a building: ' + castle.x + '_' + castle.y + ' hasBuilding false'),
            name + '\'s castle hex: ' + problems.join('; '));
        });
        problems.forEach(function(p) {
          assert(/^hasBuilding is set where there is a building: /.test(p), 'only about hasBuilding: ' + p);
        });
      });
    });
  });
}
