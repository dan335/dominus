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

      run('no-king rebuild window does not clear dominus or fire false alert', function() {
        // Regression test for the false "no longer dominus" alert race (fix
        // branch fix/dominus-no-king-race). relation_finder transiently sets
        // is_king:false for every player mid-rebuild; if checkForDominus reads
        // during that window it used to see no king, clear is_dominus, and fire
        // a false alert_noLongerDominus (then re-announce "new dominus" next
        // pass). The fix bails out when zero kings exist -- an impossible state
        // whenever >=2 players hold castles, so it can only be a transient read.
        // This test forces the zero-king window and asserts the dominus is
        // preserved and no alert fires. On the pre-fix code this FAILS (dominus
        // cleared + alert fired), which is exactly what it must catch.
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

        // simulate the mid-rebuild window: is_king:false committed for everyone
        // (relation_finder set it and hasn't restored is_king:true yet)
        Players.update({gameId: game._id}, {$set: {is_king: false}}, {multi: true});
        dManager.checkForDominus(game._id);

        // fix: a transient no-king read is ignored -> dominus preserved, no alert
        _testAssert(Players.findOne(p1, {fields:{is_dominus:1}}).is_dominus === true, 'dominus preserved during no-king window');
        _testEqual(Alerts.find({gameId: game._id, type: 'alert_noLongerDominus'}).count(), 0, 'no false noLongerDominus alert');

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


      // --- Account deletion: orphan subtree ---

      run('deleting a lord with a missing super-lord promotes its vassals to kings', function() {
        // Regression test for fix/dominus-orphan-subtree. When a deleted
        // player's `lord` points at a doc that no longer exists,
        // deleteGameAccount used to skip vassal reparenting (the if(lord) block
        // had no else), orphaning the subtree: vassals left is_king:false with a
        // dangling lord, invisible to the tree/rebuild but still counted by
        // checkForDominus -> unwinnable game. The fix promotes them to kings.
        Games.remove({}); Players.remove({});
        let game = _createTestGame({hasStarted: true});
        let uP = _createTestUser();
        let uV = _createTestUser();

        // P points at a missing lord and has one vassal V.
        let pId = Players.insert({gameId: game._id, userId: uP._id, username: uP.username,
          is_king: false, lord: 'ghost-missing-lord', king: 'ghost-missing-lord',
          vassals: [], allies_above: ['ghost-missing-lord'], allies_below: [], team: [], castle_id: 'cP'});
        let vId = Players.insert({gameId: game._id, userId: uV._id, username: uV.username,
          is_king: false, lord: pId, king: 'ghost-missing-lord',
          vassals: [], allies_above: [pId, 'ghost-missing-lord'], allies_below: [], team: [], castle_id: 'cV'});
        Players.update(pId, {$set: {vassals: [vId], allies_below: [vId]}});

        dGame.deleteGameAccount(pId);

        let v = Players.findOne(vId, {fields: {is_king: 1, lord: 1}});
        _testAssert(!!v, 'vassal still exists');
        _testAssert(v.is_king === true, 'orphaned vassal promoted to king');
        _testAssert(v.lord === null, 'orphaned vassal has no dangling lord');
        _testAssert(!Players.findOne(pId), 'deleted player removed');

        Alerts.remove({gameId: game._id});
        GlobalAlerts.remove({gameId: game._id});
        Armies.remove({gameId: game._id});
        Villages.remove({gameId: game._id});
        Markers.remove({gameId: game._id});
        _testCleanup(game._id);
        Games.remove({hasStarted: false, hasClosed: false});
        _testCleanupUser(uP._id);
        _testCleanupUser(uV._id);
      });




      // --- Auth: splitArmy ownership ---

      run('splitArmy rejects a non-owner and leaves the army intact', function() {
        // Regression test for fix/auth-split-army. splitArmy -> dArmies.split
        // looked the army up by _id only (and reset its speed/moveTime), so any
        // player could stop and fragment an enemy army. The fix requires
        // ownership.
        Games.remove({}); Players.remove({}); Armies.remove({});
        let game = _createTestGame({hasStarted: true});
        let owner = _createTestUser();
        let attacker = _createTestUser();

        let armyId = Armies.insert({gameId: game._id, user_id: owner._id, playerId: 'pOwner',
          x: 0, y: 0, footmen: 10, archers: 0, pikemen: 0, cavalry: 0, catapults: 0,
          speed: 5, moveTime: 123, name: 'testarmy'});

        function callAs(userId, method, args) {
          var inv = {userId: userId, isSimulation: false, connection: null, unblock: function() {}};
          return DDP._CurrentInvocation.withValue(inv, function() {
            return Meteor.server.method_handlers[method].apply(inv, args);
          });
        }

        var threw = false;
        try { callAs(attacker._id, 'splitArmy', [game._id, armyId, {footmen: 5}]); } catch (e) { threw = true; }
        _testAssert(threw, 'non-owner splitArmy throws');
        _testEqual(Armies.find({gameId: game._id}).count(), 1, 'no new army was split off');
        let a = Armies.findOne(armyId);
        _testEqual(a.footmen, 10, 'original army soldiers untouched');
        _testEqual(a.speed, 5, 'original army movement not reset by a non-owner');

        Armies.remove({gameId: game._id});
        _testCleanup(game._id);
        _testCleanupUser(owner._id);
        _testCleanupUser(attacker._id);
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
