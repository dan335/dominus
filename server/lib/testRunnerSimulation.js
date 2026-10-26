// A whole game, played the same way every time (T6b of the Meteor upgrade
// plan, Oct 2026). Loaded after server/lib/testRunner.js (same folder, sorts
// after it).
//
// dTest.simulation() fixes the game clock (dClock), seeds the random numbers
// (dRandom) and the ids of new documents, and runs the queue itself: jobs are
// recorded instead of sent to Bull and run in the order they were added, once
// the game clock reaches their delay. The crons run when the game clock
// passes their time. Players act through real DDP connections. So the same
// scenario leaves the same documents behind, and server/simulationTests.js
// compares them with the ones recorded before (tests/golden/simulation.json).
//
// It removes every document in the game collections when it starts, like the
// other suites: only run it against a local development database.

if (Meteor.isServer) {

  var crypto = Npm.require('crypto');
  var fs = Npm.require('fs');
  var path = Npm.require('path');

  // The crons the simulation runs, in the order SyncedCron has them, and how
  // often. A cron runs once in a step of the game clock that passes its time.
  var CRONS = [
    {name: 'army path speed jobs', every: 2 * 1000},
    {name: '5 sec job', every: 5 * 1000},
    {name: 'battle job', every: 20 * 1000},
    {name: '1 min job', every: 60 * 1000},
    {name: '5 min job', every: 5 * 60 * 1000},
    {name: '10 min job', every: 10 * 60 * 1000},
    {name: '30 min job', every: 30 * 60 * 1000},
    {name: 'midnight job', every: 24 * 60 * 60 * 1000}
  ];

  // crons that only look after Bull itself
  var CRONS_NOT_RUN = ['clean up old jobs', 'resume stuck job queue'];

  // Jobs that are recorded but not run: they draw map images, upload to S3,
  // send email or only look after Bull.
  var JOBS_NOT_RUN = ['bakeCountries', 'bakeCountry', 'createCountryMask', 'finishImage', 'generateGameMinimap',
    'generateAllMinimaps', 'sendGameStartedEmail', 'sendToMailingList', 'addToMailingList',
    'mailTemplateToOldProUsers', 'resetQueueStats'];

  // Fields left out of snapshots: counters the worker keeps up to date a
  // second after a change (debounced), login and presence details, and how
  // long a battle round took to work out.
  var FIELDS_NOT_COMPARED = {
    games: ['numPlayers', 'numVillages', 'numCountries'],
    users: ['services', 'status', 'presence', 'createdAt'],
    rounds: ['msBattleTook']
  };

  // The game's settings as the app started with them. A test that changes
  // one and doesn't put it back changes every game played after it, so the
  // simulation refuses to start until they are the same again.
  var startupSettings = null;
  Meteor.startup(function() {
    startupSettings = JSON.parse(JSON.stringify(_s));
  });

  var changedSettings = function() {
    var out = [];
    var walk = function(a, b, at) {
      if (_.isObject(a) && _.isObject(b)) {
        _.union(_.keys(a), _.keys(b)).forEach(function(key) { walk(a[key], b[key], at + '.' + key); });
      } else if (!_.isEqual(a, b)) {
        out.push(at + ' is ' + JSON.stringify(b) + ', was ' + JSON.stringify(a));
      }
    };
    walk(startupSettings, JSON.parse(JSON.stringify(_s)), '_s');
    return out;
  };

  // the app's folder: tests/ and .test-results/ are in it
  dTest.appDir = function() {
    var dirs = [process.env.PWD, process.cwd()];
    for (var i = 0; i < dirs.length; i++) {
      var dir = dirs[i];
      while (dir && dir != path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, '.meteor', 'release'))) return dir;
        dir = path.dirname(dir);
      }
    }
    throw new Error('FAIL: could not find the app folder');
  };

  // Plain data with sorted keys, dates as ISO strings and numbers to 10
  // significant digits, so floating point noise between Node versions doesn't
  // count as a change.
  dTest.canonical = function(value) {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return {$date: value.toISOString()};
    if (typeof value == 'number') {
      if (!isFinite(value)) return String(value);
      var rounded = Number(value.toPrecision(10));
      return rounded === 0 ? 0 : rounded;
    }
    if (_.isArray(value)) return _.map(value, dTest.canonical);
    if (typeof value == 'object') {
      var out = {};
      _.keys(value).sort().forEach(function(key) {
        if (value[key] !== undefined) out[key] = dTest.canonical(value[key]);
      });
      return out;
    }
    return value;
  };

  dTest.hash = function(value) {
    return crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 16);
  };

  // every collection a game writes to; the simulation empties them
  dTest.simulationCollections = function() {
    return dTest.gameCollections().concat([Games, Rounds, CountriesTemp]);
  };

  // makes dir and its parents, and empties it of step files
  var emptyDumpDir = function(dir) {
    dir.split(path.sep).reduce(function(parent, part) {
      var next = parent ? path.join(parent, part) : (part || path.sep);
      if (!fs.existsSync(next)) fs.mkdirSync(next);
      return next;
    }, '');
    fs.readdirSync(dir).forEach(function(file) {
      if (/^step-\d+\.json$/.test(file)) fs.unlinkSync(path.join(dir, file));
    });
  };

  // What must always be true of a game, whatever happened in it. Returns a
  // list of problems, each naming the rule and the documents that break it;
  // none for a sound game.
  dTest.gameInvariants = function(gameId) {
    var problems = [];
    var problem = function(rule, detail) { problems.push(rule + ': ' + detail); };

    var game = Games.findOne(gameId);
    var players = Players.find({gameId: gameId}, {sort: {_id: 1}}).fetch();
    var byId = _.indexBy(players, '_id');
    var name = function(id) { return byId[id] ? byId[id].username : String(id); };
    var castles = Castles.find({gameId: gameId}, {sort: {_id: 1}}).fetch();
    var villages = Villages.find({gameId: gameId}, {sort: {_id: 1}}).fetch();
    var armies = Armies.find({gameId: gameId}, {sort: {_id: 1}}).fetch();
    var capitals = Capitals.find({gameId: gameId}, {sort: {_id: 1}}).fetch();
    var hexes = {};
    Hexes.find({gameId: gameId}, {fields: {x: 1, y: 1, hasBuilding: 1}}).forEach(function(h) { hexes[h.x + '_' + h.y] = h; });
    var at = function(doc) { return doc.x + '_' + doc.y; };

    // castles: one each, where the player is
    var holders = _.filter(players, function(p) { return p.castle_id; });
    holders.forEach(function(p) {
      var castle = _.findWhere(castles, {_id: p.castle_id});
      if (!castle) return problem('a player\'s castle exists', p.username);
      if (castle.playerId != p._id || castle.user_id != p.userId) problem('a castle belongs to the player that has it', p.username);
      if (castle.x != p.x || castle.y != p.y) problem('a player is where their castle is', p.username);
    });
    castles.forEach(function(c) {
      if (!byId[c.playerId]) problem('a castle\'s player is in the game', c._id);
    });
    _.each(_.countBy(castles, 'playerId'), function(n, playerId) {
      if (n > 1) problem('a player has one castle', name(playerId) + ' has ' + n);
    });

    // the tree of lords and vassals
    var chain = function(p) {
      var above = [];
      var seen = {};
      seen[p._id] = true;
      for (var lord = byId[p.lord]; lord; lord = byId[lord.lord]) {
        if (seen[lord._id]) {
          problem('no one is their own lord', p.username);
          break;
        }
        seen[lord._id] = true;
        above.push(lord._id);
      }
      return above;
    };
    var same = function(a, b) { return _.isEqual(_.clone(a || []).sort(), _.clone(b || []).sort()); };
    players.forEach(function(p) {
      if (p.lord && !byId[p.lord]) problem('a lord is in the game', p.username);
      if (p.lord && byId[p.lord] && !_.contains(byId[p.lord].vassals, p._id)) problem('a lord lists their vassal', name(p.lord) + ' does not list ' + p.username);
      (p.vassals || []).forEach(function(v) {
        if (!byId[v] || byId[v].lord != p._id) problem('a vassal\'s lord is the player that lists them', p.username + ' lists ' + name(v));
      });
      if (!!p.is_king == !!p.lord) problem('a king is a player with no lord', p.username + ' is_king ' + p.is_king + ', lord ' + name(p.lord));
      var above = chain(p);
      if (!same(p.allies_above, above)) problem('allies_above is everyone above', p.username + ' has [' + _.map(p.allies_above, name).sort() + '], above are [' + _.map(above, name).sort() + ']');
      var below = _.pluck(_.filter(players, function(q) { return _.contains(chain(q), p._id); }), '_id');
      if (!same(p.allies_below, below)) problem('allies_below is everyone below', p.username + ' has [' + _.map(p.allies_below, name).sort() + '], below are [' + _.map(below, name).sort() + ']');
      var king = above.length ? _.last(above) : p._id;
      if (p.lord && p.king != king) problem('a vassal\'s king is the top of their tree', p.username + ' has ' + name(p.king) + ', the top is ' + name(king));
      if (!p.lord && p.king && p.king != p._id) problem('a king\'s king is themselves or not set', p.username + ' has ' + name(p.king));
      var counts = {num_vassals: (p.vassals || []).length, num_allies_above: (p.allies_above || []).length, num_allies_below: (p.allies_below || []).length};
      _.each(counts, function(n, field) {
        if (p[field] !== undefined && p[field] != n) problem(field + ' counts the list', p.username + ' has ' + p[field] + ', the list has ' + n);
      });
    });

    // dominus
    var dominus = _.filter(players, function(p) { return p.is_dominus; });
    if (dominus.length > 1) problem('at most one dominus', _.pluck(dominus, 'username').join(', '));
    dominus.forEach(function(d) {
      var outside = _.filter(holders, function(p) { return p._id != d._id && !_.contains(chain(p), d._id); });
      if (d.lord || outside.length) problem('the dominus is a king with every other player under them', d.username + ' (not under them: ' + _.pluck(outside, 'username').join(', ') + ')');
      if (game && game.lastDominusPlayerId != d._id) problem('the game names the dominus as its last dominus', d.username);
    });

    // resources and soldiers
    players.forEach(function(p) {
      _s.market.types_plus_gold.forEach(function(type) {
        if (typeof p[type] != 'number' || !isFinite(p[type]) || p[type] < 0) problem('resources are numbers, not below 0', p.username + ' ' + type + ' ' + p[type]);
      });
    });
    var units = [['castle', castles], ['village', villages], ['army', armies], ['capital', capitals]];
    units.forEach(function(u) {
      u[1].forEach(function(doc) {
        _s.armies.types.forEach(function(type) {
          var n = doc[type];
          if (typeof n != 'number' || n < 0 || n !== Math.floor(n)) problem('soldiers are whole numbers, not below 0', u[0] + ' ' + doc._id + ' ' + type + ' ' + n);
        });
      });
    });
    armies.forEach(function(a) {
      if (!_.some(_s.armies.types, function(type) { return a[type] > 0; })) problem('an army has soldiers', a._id);
      if (!byId[a.playerId] || byId[a.playerId].userId != a.user_id) problem('an army\'s player is in the game', a._id);
    });
    villages.forEach(function(v) {
      if (!byId[v.playerId] || byId[v.playerId].userId != v.user_id) problem('a village\'s player is in the game', v._id);
    });
    _.each(_.countBy(villages, 'playerId'), function(n, playerId) {
      if (n > _gs.villages(gameId, 'max_can_have')) problem('no more villages than allowed', name(playerId) + ' has ' + n);
    });

    // the map: every unit on a hex of the game, one building a hex, and
    // hasBuilding set where there is one
    var buildings = castles.concat(villages, capitals);
    _.each(_.countBy(buildings, at), function(n, hex) {
      if (n > 1) problem('one building a hex', n + ' at ' + hex);
    });
    buildings.concat(armies).forEach(function(doc) {
      if (!hexes[at(doc)]) problem('everything is on a hex of the game', doc._id + ' at ' + at(doc));
    });
    var buildingAt = _.indexBy(buildings, at);
    _.each(hexes, function(hex, key) {
      if (!!hex.hasBuilding != !!buildingAt[key]) problem('hasBuilding is set where there is a building', key + ' hasBuilding ' + hex.hasBuilding);
    });

    // moves
    Armypaths.find({gameId: gameId}, {sort: {_id: 1}}).forEach(function(path) {
      var army = _.findWhere(armies, {_id: path.armyId});
      if (!army) problem('a move\'s army exists', path._id);
      else if (army.user_id != path.user_id) problem('a move belongs to its army\'s player', path._id);
    });

    // markets and battles
    Market.find({gameId: gameId}, {sort: {_id: 1}}).forEach(function(m) {
      if (!(m.price > 0) || !isFinite(m.price)) problem('a market price is above 0', m.type + ' ' + m.price);
    });
    _.each(_.countBy(Battles2.find({gameId: gameId, isOver: false}).fetch(), at), function(n, hex) {
      if (n > 1) problem('one battle a hex', n + ' at ' + hex);
    });

    return problems;
  };

  // opts.seed: what the random numbers are seeded with
  // opts.startAt: the game clock's first time, a Date
  // opts.dumpDir: a folder to write each step's documents to
  dTest.simulation = function(opts) {
    if (opts.dumpDir) emptyDumpDir(opts.dumpDir);
    var sim = {
      dumpDir: opts.dumpDir,
      seed: String(opts.seed),
      startAt: opts.startAt,
      users: {},
      clients: {},
      steps: [],
      queue: [],
      unique: {},
      jobCounts: {ran: {}, notRun: {}, failed: []},
      emails: [],
      jobSeq: 0
    };

    // --- everything the simulation replaces, put back by finish() ---

    var restore = [];
    var replace = function(obj, name, fn) {
      var original = obj[name];
      obj[name] = fn;
      restore.push(function() { obj[name] = original; });
    };

    var changed = changedSettings();
    if (changed.length) {
      throw new Error('FAIL: a test changed the game settings and did not put them back: ' + changed.slice(0, 5).join('; '));
    }

    var missing = _.difference(_.keys(SyncedCron._entries), _.pluck(CRONS, 'name'), CRONS_NOT_RUN);
    if (missing.length) {
      throw new Error('FAIL: the simulation does not know when to run the crons ' + missing.join(', ') +
        ' (add them to CRONS in server/lib/testRunnerSimulation.js)');
    }

    try {
      setUp();
    } catch (e) {
      restore.reverse().forEach(function(fn) { fn(); });
      dClock.reset();
      dRandom.reset();
      throw e;
    }

    function setUp() {
      // no crons on the real clock (runAllTests has paused them already; this is
      // for a simulation played from meteor shell), no jobs left over from
      // another test, and a fresh database for the game (below)
      restore.push(dTest.pauseBackground());
      dTest.waitForJobs();

      // This process takes no more jobs from Bull until the end, so a delayed
      // job another test left behind (a retry, enemies_together_check) can't
      // land in the middle of the game.
      Queues.pauseLocal();
      restore.push(function() {
        Queues.queueNames.forEach(function(name) { dTest.settle(Queues[name].resume(true)); });
      });

      dTest.simulationCollections().forEach(function(collection) { collection.remove({}); });
      Meteor.users.remove({username: /^sim_/});

      dClock.set(sim.startAt);
      dRandom.seed(sim.seed);

      // ids of new documents come from one seeded generator per collection, so
      // an extra insert in one collection doesn't change the ids in the others
      // (only collections emptied above: an id in a collection that keeps its
      // documents could already be taken by the last simulation)
      dTest.simulationCollections().concat([Meteor.users]).forEach(function(collection) {
        var generator = Random.createWithSeeds(sim.seed, collection._name);
        replace(collection, '_makeNewID', function() { return generator.id(); });
      });

      replace(Queues, 'addAsync', async function(name, data, options, uniqueId) {
        check(name, String);
        check(data, Object);
        check(options, Object);
        check(uniqueId, Match.OneOf(Boolean, String));
        if (_.contains(JOBS_NOT_RUN, name)) {
          sim.jobCounts.notRun[name] = (sim.jobCounts.notRun[name] || 0) + 1;
          return false;
        }
        if (!Queues[name]) {
          throw new Error('FAIL: no queue for job ' + name);
        }
        if (uniqueId) {
          var key = name + '/' + uniqueId;
          if (sim.unique[key]) return false;
          sim.unique[key] = true;
          data.uniqueId = uniqueId;
        }
        data.jobName = name;
        // Bull stores the data as JSON, so a job gets dates back as strings
        sim.queue.push({name: name, data: JSON.parse(JSON.stringify(data)), uniqueId: uniqueId, seq: sim.jobSeq++,
          readyAt: dClock.nowMs() + ((options && options.delay) || 0)});
        return true;
      });

      replace(Email, 'send', function(options) { sim.emails.push(_.pick(options, 'to', 'subject')); });
      replace(Email, 'sendAsync', async function(options) { sim.emails.push(_.pick(options, 'to', 'subject')); });
      replace(Mapbaker, 'deleteS3BakesForGame', function() {});

      // The nightly relationship rebuild (updateAllKingsAllies) pauses the
      // queues and waits 5 seconds for running jobs to finish. Here no other job
      // runs at the same time, so it doesn't need to, and it mustn't pause Bull.
      replace(Queues, 'pauseAllAsync', async function() {});
      replace(Queues, 'resumeAllAsync', async function() {});
      replace(dInit, 'updateAllKingsAlliesWaitMs', 0);
    }

    // --- the queue ---

    // Runs the jobs that are due, oldest first, and the jobs they add, until
    // none are due. A job that throws is noted in jobCounts.failed (Bull
    // would retry it; here it isn't).
    sim.runJobs = function() {
      for (var n = 0; n < 20000; n++) {
        var now = dClock.nowMs();
        var due = _.filter(sim.queue, function(j) { return j.readyAt <= now; });
        if (!due.length) return;
        var job = _.min(due, function(j) { return j.readyAt * 1e6 + j.seq; });
        sim.queue = _.without(sim.queue, job);
        var result = dTest.runJob(job.name, job.data, {allowError: true});
        if (job.uniqueId) delete sim.unique[job.name + '/' + job.uniqueId];
        sim.jobCounts.ran[job.name] = (sim.jobCounts.ran[job.name] || 0) + 1;
        if (result.error) {
          sim.jobCounts.failed.push(job.name + ': ' + result.error.message);
        }
      }
      throw new Error('FAIL: the jobs never stopped adding jobs: ' + _.pluck(sim.queue, 'name').slice(0, 20).join(', '));
    };

    sim.runCron = function(name) {
      dTest.settle(SyncedCron._entries[name].job());
      sim.runJobs();
    };

    // Moves the game clock ms forward in steps of opts.step (default 20
    // seconds). In each step the due jobs run, then each cron whose time came,
    // each followed by the jobs it added. opts.until(), when given, is asked
    // after each step and stops the clock once it is true; advance throws if
    // it never is.
    sim.advance = function(ms, opts) {
      opts = opts || {};
      var step = opts.step || 20 * 1000;
      var end = dClock.nowMs() + ms;
      while (dClock.nowMs() < end) {
        var before = dClock.nowMs();
        var now = Math.min(before + step, end);
        dClock.set(now);
        sim.runJobs();
        CRONS.forEach(function(cron) {
          if (Math.floor(now / cron.every) > Math.floor(before / cron.every)) {
            sim.runCron(cron.name);
          }
        });
        if (opts.until && opts.until()) return now - (end - ms);
      }
      if (opts.until) {
        throw new Error('FAIL: ' + (opts.waitingFor || 'the condition') + ' did not happen in ' + Math.round(ms / 60000) + ' game minutes');
      }
      return ms;
    };

    // --- players ---

    sim.addUser = function(name, fields) {
      var user = dTest.helpers.createTestUser(_.extend({username: 'sim_' + name}, fields || {}));
      sim.users[name] = user;
      return user;
    };

    sim.player = function(name) {
      return Players.findOne({gameId: sim.gameId, userId: sim.users[name]._id});
    };

    sim.castle = function(name) {
      return Castles.findOne({gameId: sim.gameId, user_id: sim.users[name]._id});
    };

    sim.nameOf = function(playerId) {
      var player = playerId && Players.findOne(playerId, {fields: {username: 1}});
      return player ? player.username : (playerId ? 'missing ' + playerId : null);
    };

    // a method call as the player, the way their browser makes it; the jobs
    // it adds run before it returns
    sim.call = function(name /* , method, args */) {
      if (!sim.clients[name]) {
        sim.clients[name] = dTest.ddp.connect(sim.users[name]._id);
      }
      dTest.ddp.resetRateLimits();
      var client = sim.clients[name];
      var result = client.call.apply(client, _.toArray(arguments).slice(1));
      sim.runJobs();
      return result;
    };

    // --- what the game looks like ---

    // every document the game wrote, made canonical, by collection
    sim.snapshot = function() {
      var out = {};
      dTest.simulationCollections().concat([Meteor.users]).forEach(function(collection) {
        var name = collection._name;
        var selector = collection === Meteor.users ? {username: /^sim_/} : {};
        var omit = FIELDS_NOT_COMPARED[name] || [];
        out[name] = collection.find(selector, {sort: {_id: 1}}).map(function(doc) {
          return dTest.canonical(_.omit(doc, omit));
        });
      });
      return out;
    };

    // Ends a step of the scenario: lets the worker's debounced counters and
    // observers catch up, checks the invariants and notes the step's facts,
    // a hash of each collection and the jobs that ran.
    sim.endStep = function(name, facts) {
      sim.runJobs();
      dTest.sleep(1200);
      var snapshot = sim.snapshot();
      var problems = [];
      Games.find({hasClosed: false}, {sort: {_id: 1}}).forEach(function(game) {
        problems = problems.concat(dTest.gameInvariants(game._id));
      });
      var step = {
        step: name,
        time: dClock.now().toISOString(),
        facts: dTest.canonical(facts ? facts(sim) : {}),
        invariantProblems: problems,
        jobs: dTest.canonical(sim.jobCounts),
        emails: sim.emails.length,
        collections: {}
      };
      _.each(snapshot, function(docs, collection) {
        step.collections[collection] = {count: docs.length, hash: dTest.hash(docs)};
      });
      sim.steps.push(step);
      if (sim.dumpDir) {
        var number = sim.steps.length < 10 ? '0' + sim.steps.length : String(sim.steps.length);
        fs.writeFileSync(path.join(sim.dumpDir, 'step-' + number + '.json'), JSON.stringify({step: step, documents: snapshot}, null, 1) + '\n');
      }
      sim.jobCounts = {ran: {}, notRun: {}, failed: []};
      sim.emails = [];
      return step;
    };

    // closes the connections, puts back what was replaced and removes the game
    sim.finish = function(keepDocuments) {
      _.each(sim.clients, function(client) { client.close(); });
      sim.clients = {};
      restore.reverse().forEach(function(fn) { fn(); });
      restore = [];
      dClock.reset();
      dRandom.reset();
      if (!keepDocuments) {
        dTest.simulationCollections().forEach(function(collection) { collection.remove({}); });
        Markers.remove({});
        MarkerGroups.remove({});
        Meteor.users.remove({username: /^sim_/});
      }
    };

    return sim;
  };
}
