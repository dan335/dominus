// Game Creation Tests
// Run from meteor shell:   Meteor.call('runGameCreationTests')
// Or via URL in browser:   (open browser console) Meteor.call('runGameCreationTests', function(err, r) { console.log(r); })

if (Meteor.isServer) {

  function _testAssert(condition, message) {
    if (!condition) throw new Error('FAIL: ' + message);
  }

  function _testEqual(actual, expected, message) {
    if (actual !== expected) throw new Error('FAIL: ' + message + ' (expected ' + expected + ', got ' + actual + ')');
  }

  function _createTestGame(overrides) {
    let game = {
      name: 'Test Game',
      desc: 'A test game',
      maxPlayers: 200,
      startAt: new Date(),
      isRelaxed: false,
      isSpeed: false,
      isCrazyFast: false,
      isProOnly: false,
      isKingOfHill: false,
      isNoLargeResources: false,
      createdAt: new Date(),
      hasEnded: false,
      hasStarted: false,
      isStarting: false,
      hasClosed: false,
      closeDate: null,
      endDate: null,
      lastDominusPlayerId: null,
      taxesCollected: 0,
      tree: null,
      map_size: null,
      minimapBgPath: null,
      numPlayers: 0,
      dominusAchieved: false,
      minimap: null
    };
    if (overrides) _.extend(game, overrides);
    game._id = Games.insert(game);
    return game;
  }

  function _createTestUser(overrides) {
    let user = {
      username: 'testuser_' + Random.id(6),
      male: true,
      pro: false,
      verifiedEmail: true,
      proTokens: 0
    };
    if (overrides) _.extend(user, overrides);
    user._id = Meteor.users.insert(user);
    return user;
  }

  function _testCleanup(gameId) {
    Games.remove(gameId);
    Players.remove({gameId: gameId});
    Castles.remove({gameId: gameId});
    Market.remove({gameId: gameId});
    Markethistory.remove({gameId: gameId});
    Gamesignups.remove({gameId: gameId});
    Hexes.remove({gameId: gameId});
    Countries.remove({gameId: gameId});
    Capitals.remove({gameId: gameId});
  }

  function _testCleanupUser(userId) {
    Meteor.users.remove(userId);
  }


  Meteor.methods({
    'runGameCreationTests': function() {
      let results = [];
      let passed = 0;
      let failed = 0;

      function run(name, fn) {
        try {
          fn();
          results.push({name: name, status: 'PASS'});
          passed++;
        } catch(e) {
          results.push({name: name, status: 'FAIL', error: e.message});
          failed++;
        }
      }


      // --- Game Lifecycle ---

      run('game insert has correct default flags', function() {
        let game = _createTestGame();
        let doc = Games.findOne(game._id);
        _testAssert(doc.hasStarted === false, 'hasStarted');
        _testAssert(doc.isStarting === false, 'isStarting');
        _testAssert(doc.hasEnded === false, 'hasEnded');
        _testAssert(doc.hasClosed === false, 'hasClosed');
        _testAssert(doc.dominusAchieved === false, 'dominusAchieved');
        _testEqual(doc.numPlayers, 0, 'numPlayers');
        _testEqual(doc.taxesCollected, 0, 'taxesCollected');
        _testAssert(doc.closeDate === null, 'closeDate');
        _testAssert(doc.endDate === null, 'endDate');
        _testCleanup(game._id);
      });

      run('startGame transitions to started state', function() {
        let game = _createTestGame();
        let user = _createTestUser();
        Gamesignups.insert({gameId: game._id, userId: user._id, username: user.username, createdAt: new Date(), usedToken: false});
        Mapmaker.eraseMap(game._id);
        _s.mapmaker.minHexesInCountry = 100;
        _s.mapmaker.maxHexesInCountry = 100;
        Mapmaker.addCountry(game._id, true);

        dManager.startGame(game, true);

        let g = Games.findOne(game._id);
        _testAssert(g.hasStarted === true, 'hasStarted');
        _testAssert(g.startedAt !== undefined, 'startedAt set');
        _testEqual(Gamesignups.find({gameId: game._id}).count(), 0, 'signups removed');
        _testEqual(Players.find({gameId: game._id}).count(), 1, 'player created');
        _testEqual(Market.find({gameId: game._id}).count(), _s.market.types.length, 'market created');
        _testCleanup(game._id);
        _testCleanupUser(user._id);
      });

      run('startGame with zero signups works', function() {
        let game = _createTestGame();
        dManager.startGame(game, true);
        let g = Games.findOne(game._id);
        _testAssert(g.hasStarted === true, 'hasStarted');
        _testEqual(Market.find({gameId: game._id}).count(), _s.market.types.length, 'market created');
        _testCleanup(game._id);
      });


      // --- Player Creation ---

      run('createPlayer correct starting resources', function() {
        let game = _createTestGame({hasStarted: true});
        let user = _createTestUser();
        Mapmaker.eraseMap(game._id);
        _s.mapmaker.minHexesInCountry = 100;
        _s.mapmaker.maxHexesInCountry = 100;
        Mapmaker.addCountry(game._id, true);

        let playerId = dCastles.createPlayer(game._id, user._id, user.username, false);
        _testAssert(!!playerId, 'playerId returned');
        let p = Players.findOne(playerId);
        _testEqual(p.gold, _s.init.startingResources.gold, 'gold');
        _testEqual(p.grain, _s.init.startingResources.grain, 'grain');
        _testEqual(p.lumber, _s.init.startingResources.lumber, 'lumber');
        _testEqual(p.ore, _s.init.startingResources.ore, 'ore');
        _testEqual(p.wool, _s.init.startingResources.wool, 'wool');
        _testEqual(p.clay, _s.init.startingResources.clay, 'clay');
        _testEqual(p.glass, _s.init.startingResources.glass, 'glass');
        _testCleanup(game._id);
        _testCleanupUser(user._id);
      });

      run('createPlayer crazyFast boosted resources', function() {
        let game = _createTestGame({hasStarted: true, isCrazyFast: true});
        let user = _createTestUser();
        Mapmaker.eraseMap(game._id);
        _s.mapmaker.minHexesInCountry = 100;
        _s.mapmaker.maxHexesInCountry = 100;
        Mapmaker.addCountry(game._id, true);

        let playerId = dCastles.createPlayer(game._id, user._id, user.username, false);
        _testAssert(!!playerId, 'playerId returned');
        let p = Players.findOne(playerId);
        _testEqual(p.gold, 10000, 'gold');
        _testEqual(p.grain, 1500, 'grain');
        _testEqual(p.lumber, 2000, 'lumber');
        _testEqual(p.ore, 1500, 'ore');
        _testEqual(p.wool, 1500, 'wool');
        _testEqual(p.clay, 2000, 'clay');
        _testEqual(p.glass, 1500, 'glass');
        _testCleanup(game._id);
        _testCleanupUser(user._id);
      });

      run('createPlayer rejects duplicate', function() {
        let game = _createTestGame({hasStarted: true});
        let user = _createTestUser();
        Mapmaker.eraseMap(game._id);
        _s.mapmaker.minHexesInCountry = 100;
        _s.mapmaker.maxHexesInCountry = 100;
        Mapmaker.addCountry(game._id, true);

        let id1 = dCastles.createPlayer(game._id, user._id, user.username, false);
        _testAssert(!!id1, 'first succeeds');
        let id2 = dCastles.createPlayer(game._id, user._id, user.username, false);
        _testAssert(!id2, 'second returns false');
        _testEqual(Players.find({gameId: game._id}).count(), 1, 'one player');
        _testCleanup(game._id);
        _testCleanupUser(user._id);
      });

      run('createPlayer rejects when dominusAchieved', function() {
        let game = _createTestGame({hasStarted: true, dominusAchieved: true});
        let user = _createTestUser();
        let playerId = dCastles.createPlayer(game._id, user._id, user.username, false);
        _testAssert(!playerId, 'returns false');
        _testCleanup(game._id);
        _testCleanupUser(user._id);
      });

      run('createPlayer creates castle at valid hex', function() {
        let game = _createTestGame({hasStarted: true});
        let user = _createTestUser();
        Mapmaker.eraseMap(game._id);
        _s.mapmaker.minHexesInCountry = 100;
        _s.mapmaker.maxHexesInCountry = 100;
        Mapmaker.addCountry(game._id, true);

        let playerId = dCastles.createPlayer(game._id, user._id, user.username, false);
        let p = Players.findOne(playerId);
        _testAssert(p.x !== null, 'x set');
        _testAssert(p.y !== null, 'y set');
        _testAssert(p.castle_id !== null, 'castle_id set');
        let castle = Castles.findOne(p.castle_id);
        _testAssert(castle !== undefined, 'castle exists');
        _testEqual(castle.x, p.x, 'castle x');
        _testEqual(castle.y, p.y, 'castle y');
        _testCleanup(game._id);
        _testCleanupUser(user._id);
      });

      run('createPlayer rejects unverified email', function() {
        let game = _createTestGame({hasStarted: true});
        let user = _createTestUser({verifiedEmail: false});
        let playerId = dCastles.createPlayer(game._id, user._id, user.username, false);
        _testAssert(!playerId, 'returns false');
        _testCleanup(game._id);
        _testCleanupUser(user._id);
      });


      // --- Market Creation ---

      run('createMarket creates one doc per resource type', function() {
        let game = _createTestGame();
        dMarket.createMarket(game._id);
        _testEqual(Market.find({gameId: game._id}).count(), _s.market.types.length, 'count');
        _s.market.types.forEach(function(type) {
          _testAssert(Market.findOne({gameId: game._id, type: type}) !== undefined, type + ' exists');
        });
        _testCleanup(game._id);
      });

      run('createMarket correct starting prices', function() {
        let game = _createTestGame();
        dMarket.createMarket(game._id);
        Market.find({gameId: game._id}).forEach(function(doc) {
          _testEqual(doc.price, _s.market.startPrice[doc.type], doc.type + ' price');
        });
        _testCleanup(game._id);
      });

      run('createMarket is idempotent', function() {
        let game = _createTestGame();
        dMarket.createMarket(game._id);
        dMarket.createMarket(game._id);
        _testEqual(Market.find({gameId: game._id}).count(), _s.market.types.length, 'no dupes');
        _testCleanup(game._id);
      });


      // --- Signup Validation ---

      run('signup after startAt is detectable', function() {
        let game = _createTestGame({startAt: moment().subtract(1, 'day').toDate()});
        _testAssert(moment().isAfter(moment(game.startAt)), 'past startAt detected');
        _testCleanup(game._id);
      });

      run('signup full game is detectable', function() {
        let game = _createTestGame({maxPlayers: 2});
        for (let i = 0; i < 3; i++) {
          Gamesignups.insert({gameId: game._id, userId: 'fake' + i, username: 'p' + i, createdAt: new Date(), usedToken: false});
        }
        _testAssert(Gamesignups.find({gameId: game._id}).count() > game.maxPlayers, 'over max');
        _testCleanup(game._id);
      });


      // --- Auto Game Creation ---

      run('createNextGame creates game with correct fields', function() {
        Games.remove({});
        let gameId = dManager.createNextGame();
        _testAssert(!!gameId, 'gameId returned');
        let g = Games.findOne(gameId);
        _testEqual(g.name, 'Game 1', 'name');
        _testEqual(g.desc, '', 'desc empty');
        _testEqual(g.maxPlayers, 50, 'maxPlayers');
        _testEqual(g.isRelaxed, false, 'isRelaxed');
        _testEqual(g.isSpeed, false, 'isSpeed');
        _testEqual(g.isCrazyFast, false, 'isCrazyFast');
        _testEqual(g.isProOnly, false, 'isProOnly');
        _testEqual(g.isKingOfHill, false, 'isKingOfHill');
        _testEqual(g.isNoLargeResources, false, 'isNoLargeResources');
        _testEqual(g.hasStarted, false, 'hasStarted');
        _testEqual(g.hasEnded, false, 'hasEnded');
        _testEqual(g.hasClosed, false, 'hasClosed');
        _testEqual(g.isStarting, false, 'isStarting');
        _testEqual(g.dominusAchieved, false, 'dominusAchieved');
        _testEqual(g.numPlayers, 0, 'numPlayers');
        _testEqual(g.taxesCollected, 0, 'taxesCollected');
        _testAssert(g.startAt instanceof Date, 'startAt is Date');
        _testAssert(g.createdAt instanceof Date, 'createdAt is Date');
        Games.remove(gameId);
      });

      run('createNextGame names first game "Game 1"', function() {
        Games.remove({});
        let gameId = dManager.createNextGame();
        _testEqual(Games.findOne(gameId).name, 'Game 1', 'first game name');
        Games.remove(gameId);
      });

      run('createNextGame names sequentially', function() {
        Games.remove({});
        // insert a "Game 3" as if it existed before
        let oldId = Games.insert({name: 'Game 3', createdAt: new Date(), hasStarted: true, hasClosed: true});
        let gameId = dManager.createNextGame();
        _testEqual(Games.findOne(gameId).name, 'Game 4', 'sequential name');
        Games.remove(gameId);
        Games.remove(oldId);
      });

      run('createNextGame handles non-standard previous name', function() {
        Games.remove({});
        let oldId = Games.insert({name: 'My Custom Game', createdAt: new Date(), hasStarted: true, hasClosed: true});
        let gameId = dManager.createNextGame();
        _testEqual(Games.findOne(gameId).name, 'Game 1', 'fallback to Game 1');
        Games.remove(gameId);
        Games.remove(oldId);
      });

      run('createNextGame does not create duplicate', function() {
        Games.remove({});
        let id1 = dManager.createNextGame();
        let id2 = dManager.createNextGame();
        _testAssert(!!id1, 'first creates');
        _testAssert(!id2, 'second returns null');
        _testEqual(Games.find({hasStarted: false, hasClosed: false}).count(), 1, 'only one pending');
        Games.remove(id1);
      });

      run('createNextGame startAt is ~72 hours in future', function() {
        Games.remove({});
        let gameId = dManager.createNextGame();
        let g = Games.findOne(gameId);
        let diff = g.startAt.getTime() - new Date().getTime();
        let hours = diff / (1000 * 60 * 60);
        _testAssert(hours > 71 && hours < 73, 'startAt ~72h from now (got ' + hours.toFixed(1) + 'h)');
        Games.remove(gameId);
      });

      run('createNextGame picks highest game number', function() {
        Games.remove({});
        let id1 = Games.insert({name: 'Game 5', createdAt: new Date('2020-01-01'), hasStarted: true, hasClosed: true});
        let id2 = Games.insert({name: 'Game 2', createdAt: new Date('2021-01-01'), hasStarted: true, hasClosed: true});
        let id3 = Games.insert({name: 'Game 10', createdAt: new Date('2019-01-01'), hasStarted: true, hasClosed: true});
        let gameId = dManager.createNextGame();
        _testEqual(Games.findOne(gameId).name, 'Game 11', 'picks highest N + 1');
        Games.remove(gameId);
        Games.remove(id1);
        Games.remove(id2);
        Games.remove(id3);
      });

      run('dominus achievement creates next game', function() {
        Games.remove({});
        Players.remove({});
        let game = _createTestGame({hasStarted: true});
        let user1 = _createTestUser({username: 'king_' + Random.id(4)});
        let user2 = _createTestUser({username: 'vassal_' + Random.id(4)});

        // create king with vassal (dominus condition)
        let p1 = Players.insert({gameId: game._id, userId: user1._id, username: user1.username, is_king: true, king: null, castle_id: 'c1', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});
        let p2 = Players.insert({gameId: game._id, userId: user2._id, username: user2.username, is_king: false, king: p1, castle_id: 'c2', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});

        dManager.checkForDominus(game._id);

        // verify new game was created
        let newGame = Games.findOne({hasStarted: false, hasClosed: false, _id: {$ne: game._id}});
        _testAssert(!!newGame, 'new game created');
        _testEqual(newGame.name, 'Game 1', 'new game named Game 1');

        _testCleanup(game._id);
        if (newGame) Games.remove(newGame._id);
        _testCleanupUser(user1._id);
        _testCleanupUser(user2._id);
      });

      run('re-achieving dominus does not create second game', function() {
        Games.remove({});
        Players.remove({});
        let game = _createTestGame({hasStarted: true});
        let user1 = _createTestUser({username: 'king_' + Random.id(4)});
        let user2 = _createTestUser({username: 'vassal_' + Random.id(4)});

        // dominus condition
        let p1 = Players.insert({gameId: game._id, userId: user1._id, username: user1.username, is_king: true, king: null, castle_id: 'c1', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});
        let p2 = Players.insert({gameId: game._id, userId: user2._id, username: user2.username, is_king: false, king: p1, castle_id: 'c2', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});

        // first dominus
        dManager.checkForDominus(game._id);
        let count1 = Games.find({hasStarted: false, hasClosed: false, _id: {$ne: game._id}}).count();
        _testEqual(count1, 1, 'one pending game after first dominus');

        // simulate losing dominus then re-achieving
        Players.update(p2, {$set: {is_king: true, king: null}});
        dManager.checkForDominus(game._id); // no dominus now
        Players.update(p2, {$set: {is_king: false, king: p1}});
        dManager.checkForDominus(game._id); // dominus again

        let count2 = Games.find({hasStarted: false, hasClosed: false, _id: {$ne: game._id}}).count();
        _testEqual(count2, 1, 'still only one pending game');

        _testCleanup(game._id);
        Games.remove({hasStarted: false, hasClosed: false});
        _testCleanupUser(user1._id);
        _testCleanupUser(user2._id);
      });

      run('auto-created game compatible with checkForGameStart', function() {
        Games.remove({});
        let gameId = dManager.createNextGame();
        let g = Games.findOne(gameId);
        // checkForGameStart query: {hasStarted:false, isStarting:false, startAt:{$lte:new Date()}}
        _testEqual(g.hasStarted, false, 'hasStarted false');
        _testEqual(g.isStarting, false, 'isStarting false');
        _testAssert(g.startAt instanceof Date, 'startAt is Date');
        // simulate time passing: if startAt were in the past, it would match
        let query = {_id: gameId, hasStarted: false, isStarting: false, startAt: {$lte: moment().add(73, 'hours').toDate()}};
        _testAssert(!!Games.findOne(query), 'matches checkForGameStart query when time passes');
        Games.remove(gameId);
      });


      // --- Nightly Rebuild ---

      run('stale is_king:false during rebuild causes false noLongerDominus alert', function() {
        // This test proves the mechanism of the nightly bug:
        // relation_finder.traverse_down sets is_king:false for all players,
        // then reached_top restores is_king:true for the king. If the bulk op
        // hasn't committed when checkForDominus runs, it sees no kings and
        // fires a false "no longer dominus" alert.
        Games.remove({});
        Players.remove({});
        Alerts.remove({});
        GlobalAlerts.remove({});
        let game = _createTestGame({hasStarted: true});
        let user1 = _createTestUser({username: 'king_' + Random.id(4)});
        let user2 = _createTestUser({username: 'vassal_' + Random.id(4)});

        let p1 = Players.insert({gameId: game._id, userId: user1._id, username: user1.username, is_king: true, king: null, lord: null, castle_id: 'c1', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});
        let p2 = Players.insert({gameId: game._id, userId: user2._id, username: user2.username, is_king: false, king: p1, lord: p1, castle_id: 'c2', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});

        // establish dominus
        dManager.checkForDominus(game._id);
        _testAssert(Players.findOne(p1, {fields:{is_dominus:1}}).is_dominus === true, 'p1 is dominus');
        Alerts.remove({gameId: game._id});
        GlobalAlerts.remove({gameId: game._id});

        // simulate the intermediate state: relation_finder has set is_king:false
        // for everyone but the bulk op restoring is_king:true hasn't committed yet
        Players.update({gameId: game._id}, {$set: {is_king: false}}, {multi: true});
        dManager.checkForDominus(game._id);

        // proves: stale is_king:false causes a false alert
        let falseAlerts = Alerts.find({gameId: game._id, type: 'alert_noLongerDominus'}).count();
        _testAssert(falseAlerts > 0, 'stale is_king:false causes false noLongerDominus alert');

        Alerts.remove({gameId: game._id});
        GlobalAlerts.remove({gameId: game._id});
        _testCleanup(game._id);
        Games.remove({hasStarted: false, hasClosed: false});
        _testCleanupUser(user1._id);
        _testCleanupUser(user2._id);
      });

      run('nightly rebuild + checkForDominus does not send false alert', function() {
        // Full nightly flow: rebuildRelationships then checkForDominus.
        // With the fix (synchronous bulk.execute), is_king is correctly
        // committed before checkForDominus queries it.
        Games.remove({});
        Players.remove({});
        Alerts.remove({});
        GlobalAlerts.remove({});
        let game = _createTestGame({hasStarted: true});
        let user1 = _createTestUser({username: 'king_' + Random.id(4)});
        let user2 = _createTestUser({username: 'vassal_' + Random.id(4)});
        let user3 = _createTestUser({username: 'vassal2_' + Random.id(4)});

        let p1 = Players.insert({gameId: game._id, userId: user1._id, username: user1.username, is_king: true, king: null, lord: null, castle_id: 'c1', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});
        let p2 = Players.insert({gameId: game._id, userId: user2._id, username: user2.username, is_king: false, king: p1, lord: p1, castle_id: 'c2', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});
        let p3 = Players.insert({gameId: game._id, userId: user3._id, username: user3.username, is_king: false, king: p1, lord: p1, castle_id: 'c3', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});

        // establish dominus
        dManager.checkForDominus(game._id);
        _testAssert(Players.findOne(p1, {fields:{is_dominus:1}}).is_dominus === true, 'p1 is dominus');
        Alerts.remove({gameId: game._id});
        GlobalAlerts.remove({gameId: game._id});

        // simulate midnight: rebuild relationships then check dominus
        dInit.rebuildRelationships(game._id);
        dManager.checkForDominus(game._id);

        // dominus should be unchanged, no false alerts
        _testAssert(Players.findOne(p1, {fields:{is_dominus:1}}).is_dominus === true, 'p1 still dominus after rebuild');
        _testEqual(Alerts.find({gameId: game._id, type: 'alert_noLongerDominus'}).count(), 0, 'no false noLongerDominus alert');
        _testEqual(GlobalAlerts.find({gameId: game._id, type: 'ga_newDominus'}).count(), 0, 'no false newDominus global alert');

        Alerts.remove({gameId: game._id});
        GlobalAlerts.remove({gameId: game._id});
        _testCleanup(game._id);
        Games.remove({hasStarted: false, hasClosed: false});
        _testCleanupUser(user1._id);
        _testCleanupUser(user2._id);
        _testCleanupUser(user3._id);
      });


      // --- Results ---
      console.log('\n========================================');
      console.log('  Game Creation Tests: ' + passed + ' passed, ' + failed + ' failed');
      console.log('========================================');
      results.forEach(function(r) {
        let icon = r.status === 'PASS' ? '+' : 'X';
        console.log('  [' + icon + '] ' + r.name + (r.error ? ' -- ' + r.error : ''));
      });
      console.log('');

      return {passed: passed, failed: failed, results: results};
    }
  });
}
