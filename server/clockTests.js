// The game clock and random source (packages/dominus-clock, Oct 2026).
//
// Game code reads "now" from dClock and draws random numbers from dRandom. Left
// alone they are exactly new Date() and the calls they replaced; tests can fix
// the clock, move it forward and seed the random numbers, which the
// deterministic game simulation (T6b) relies on.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    dTest.addSuite('game clock and random source (server/clockTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;

      // fn runs with obj[name] replaced by a wrapper that counts its calls
      function counting(obj, name, fn) {
        var original = obj[name];
        var calls = 0;
        obj[name] = function() { calls++; return original.apply(this, arguments); };
        try {
          fn();
        } finally {
          obj[name] = original;
        }
        return calls;
      }

      function sequence(n, fn) {
        return JSON.stringify(_.times(n, fn));
      }


      // --- dClock ---

      run('dClock: untouched, it is the real clock', function() {
        assert(!dClock.isFixed(), 'not fixed');
        var before = Date.now();
        var now = dClock.now();
        var ms = dClock.nowMs();
        var after = Date.now();
        assert(now instanceof Date, 'now() is a Date');
        assert(now.getTime() >= before && now.getTime() <= after, 'now() is the current time');
        assert(ms >= before && ms <= after, 'nowMs() is the current time in ms');
        assert(dClock.now() !== dClock.now(), 'a new Date each call');
      });

      run('dClock: set fixes the time, advance moves it forward, reset goes back to the real clock', function() {
        var start = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
        dClock.set(start);
        assert(dClock.isFixed(), 'fixed');
        equal(dClock.now().getTime(), start.getTime(), 'now() is the set time');
        equal(dClock.nowMs(), start.getTime(), 'nowMs() too');
        dTest.sleep(20);
        equal(dClock.nowMs(), start.getTime(), 'it does not move on its own');

        var now = dClock.now();
        now.setFullYear(1999);
        equal(dClock.now().getTime(), start.getTime(), 'changing a returned Date does not change the clock');

        dClock.advance(90 * 1000);
        equal(dClock.nowMs(), start.getTime() + 90 * 1000, 'advanced 90 seconds');
        equal(moment(dClock.now()).diff(moment(start), 'seconds'), 90, 'moment sees it');

        dClock.set(start.getTime() + 5);
        equal(dClock.nowMs(), start.getTime() + 5, 'set takes ms too');

        dClock.reset();
        assert(!dClock.isFixed(), 'reset: not fixed');
        assert(Math.abs(dClock.nowMs() - Date.now()) < 1000, 'reset: the real time again');
      });

      run('dClock: refuses bad input, advancing a clock that is not fixed, and fixing time in production', function() {
        assert(dTest.throws(function() { dClock.advance(1000); }), 'advance without set');
        assert(dTest.throws(function() { dClock.set('tomorrow'); }), 'set with a string');
        assert(dTest.throws(function() { dClock.set(NaN); }), 'set with NaN');
        dClock.set(0);
        assert(dTest.throws(function() { dClock.advance(-1); }), 'advance backwards');
        assert(dTest.throws(function() { dClock.advance('1'); }), 'advance with a string');
        equal(dClock.nowMs(), 0, 'clock unchanged by the refused calls');
        dClock.reset();

        var isProduction = Meteor.isProduction;
        Meteor.isProduction = true;
        try {
          assert(dTest.throws(function() { dClock.set(0); }), 'set refused in production');
          assert(dTest.throws(function() { dRandom.seed('x'); }), 'seed refused in production');
          dClock.reset();
          dRandom.reset();
        } finally {
          Meteor.isProduction = isProduction;
        }
        assert(!dClock.isFixed() && !dRandom.isSeeded(), 'nothing was fixed or seeded');
      });


      // --- dRandom ---

      run('dRandom: unseeded, each call is the call it replaced', function() {
        assert(!dRandom.isSeeded(), 'not seeded');
        equal(counting(Math, 'random', function() { dRandom.fraction(); }), 1, 'fraction() calls Math.random');
        equal(counting(_, 'random', function() { dRandom.random(5); }), 1, 'random() calls _.random');
        equal(counting(_, 'shuffle', function() { dRandom.shuffle([1, 2, 3]); }), 1, 'shuffle() calls _.shuffle');

        _.times(200, function() {
          var f = dRandom.fraction();
          assert(f >= 0 && f < 1, 'fraction in [0, 1)');
          var r = dRandom.random(3);
          assert(r >= 0 && r <= 3 && r === Math.floor(r), 'random(3) an integer from 0 to 3');
          var s = dRandom.random(2, 4);
          assert(s >= 2 && s <= 4 && s === Math.floor(s), 'random(2, 4) an integer from 2 to 4');
        });
        var list = [1, 2, 3, 4, 5];
        equal(JSON.stringify(_.sortBy(dRandom.shuffle(list), _.identity)), JSON.stringify(list), 'shuffle keeps every item');
      });

      run('dRandom: seeded, the same seed gives the same numbers, without touching Math.random', function() {
        function draw() {
          return [sequence(5, function() { return dRandom.fraction(); }),
            sequence(5, function() { return dRandom.random(9); }),
            sequence(5, function() { return dRandom.random(10, 12); }),
            JSON.stringify(dRandom.shuffle(_.range(10)))].join(' ');
        }
        dRandom.seed('alpha');
        assert(dRandom.isSeeded(), 'seeded');
        var first;
        var mathCalls = counting(Math, 'random', function() { first = draw(); });
        equal(mathCalls, 0, 'Math.random not used');
        dRandom.seed('alpha');
        equal(draw(), first, 'same seed, same numbers');
        dRandom.seed('beta');
        assert(draw() != first, 'another seed, other numbers');

        dRandom.seed('alpha');
        _.times(500, function() {
          var f = dRandom.fraction();
          assert(f >= 0 && f < 1, 'fraction in [0, 1)');
          var r = dRandom.random(10, 12);
          assert(r >= 10 && r <= 12 && r === Math.floor(r), 'random(10, 12) from 10 to 12');
        });
        var list = _.range(20);
        var shuffled = dRandom.shuffle(list);
        equal(JSON.stringify(list), JSON.stringify(_.range(20)), 'shuffle leaves the list alone');
        equal(JSON.stringify(_.sortBy(shuffled, _.identity)), JSON.stringify(list), 'and keeps every item');

        dRandom.reset();
        assert(!dRandom.isSeeded(), 'reset: not seeded');
        equal(counting(Math, 'random', function() { dRandom.fraction(); }), 1, 'reset: Math.random again');
      });

      run('dRandom.id: unseeded it is Random.id(), seeded the same seed gives the same ids', function() {
        equal(counting(Random, 'id', function() { dRandom.id(); }), 1, 'unseeded: calls Random.id');
        assert(/^[23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz]{17}$/.test(dRandom.id()), 'unseeded: a 17 character id');

        dRandom.seed('ids');
        var first;
        equal(counting(Random, 'id', function() { first = sequence(5, function() { return dRandom.id(); }); }), 0, 'seeded: Random.id not used');
        _.each(JSON.parse(first), function(id) {
          assert(/^[23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz]{17}$/.test(id), 'seeded: a 17 character id');
        });
        equal(_.uniq(JSON.parse(first)).length, 5, 'seeded: all different');
        dRandom.seed('ids');
        equal(sequence(5, function() { return dRandom.id(); }), first, 'same seed, same ids');
        dRandom.reset();
      });


      // --- game code uses them ---

      run('game code: with the clock fixed, new armies, moves and income use the game time', function() {
        var w = dTest.buildGameWorld({players: 1});
        try {
          var future = moment().add(10, 'days').toDate();
          dClock.set(future);

          var army;
          dTest.recordJobs(function() { army = dTest.settle(dArmies.create(w.players[0]._id, {footmen: 2}, w.castle(0).x, w.castle(0).y)); });
          army = Armies.findOne(army._id);
          equal(army.created_at.getTime(), future.getTime(), 'army created_at');
          equal(army.last_move_at.getTime(), future.getTime(), 'army last_move_at');

          // paid in real time only a moment ago, but due by the game clock
          Players.update(w.players[0]._id, {$set: {lastIncomeUpdate: new Date()}});
          var gold = w.player(0).gold;
          dTest.settle(dIncome.collectCastleIncome());
          var p = w.player(0);
          assert(p.gold > gold, 'castle income paid, since the game clock says it is due');
          equal(p.lastIncomeUpdate.getTime(), future.getTime(), 'lastIncomeUpdate is the game time');
          gold = p.gold;
          dTest.settle(dIncome.collectCastleIncome());
          equal(w.player(0).gold, gold, 'not paid again at the same game time');
          dClock.advance(_gs.castles(w.gameId, 'incomeInterval') + 1);
          dTest.settle(dIncome.collectCastleIncome());
          assert(w.player(0).gold > gold, 'paid again once the interval has passed in game time');

          // a path that moved a minute ago by the game clock is not due yet
          Armypaths.insert({gameId: w.gameId, armyId: army._id, user_id: army.user_id, index: 0, x: army.x + 1, y: army.y,
            paused: false, speed: 5, hexes: [{x: army.x + 1, y: army.y}], countryIds: ['c'], distance: 1, time: 1,
            last_move_at: moment(dClock.now()).subtract(1, 'minute').toDate()});
          dTest.settle(dArmies.moveArmiesJob());
          equal(Armies.findOne(army._id).x, army.x, 'not moved before its time');
          dClock.advance(5 * 60 * 1000);
          dTest.recordJobs(function() { dTest.settle(dArmies.moveArmiesJob()); });
          var moved = Armies.findOne(army._id);
          equal(moved.x, army.x + 1, 'moved once its time passed in game time');
          equal(moved.last_move_at.getTime(), dClock.nowMs(), 'last_move_at is the game time');
        } finally {
          dClock.reset();
          w.cleanup();
        }
      });

      run('game code: with the random source seeded, generated names repeat', function() {
        function names() {
          return [dCastles.createName(), dArmies.createName(), dCapitals.createName()].join(', ');
        }
        dRandom.seed('names');
        var first = names();
        dRandom.seed('names');
        equal(names(), first, 'same seed, same names');
        dRandom.reset();
      });
    });
  });
}
