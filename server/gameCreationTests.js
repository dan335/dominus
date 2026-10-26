// Game Creation Tests
// Run from meteor shell:   Meteor.call('runAllTests')   (server/lib/testRunner.js)
// These tests wipe whole collections (Games, Players, Armies, ...). Only run them
// against a local development database. The method refuses client calls and
// production builds.

if (Meteor.isServer) {

  function _testAssert(condition, message) {
    if (!condition) throw new Error('FAIL: ' + message);
  }

  function _testEqual(actual, expected, message) {
    if (actual !== expected) throw new Error('FAIL: ' + message + ' (expected ' + expected + ', got ' + actual + ')');
  }

  async function _createTestGame(overrides) {
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
    game._id = await Games.insertAsync(game);
    _gs.cacheGame(game);
    return game;
  }

  async function _createTestUser(overrides) {
    let user = {
      username: 'testuser_' + Random.id(6),
      male: true,
      pro: false,
      verifiedEmail: true,
      proTokens: 0
    };
    if (overrides) _.extend(user, overrides);
    user._id = await Meteor.users.insertAsync(user);
    return user;
  }

  // one 100 hex country, with the map settings put back afterwards: they are
  // read by every later suite (the game simulation's map depends on them)
  async function _addTestCountry(gameId) {
    let sizes = _.pick(_s.mapmaker, 'minHexesInCountry', 'maxHexesInCountry');
    try {
      _s.mapmaker.minHexesInCountry = 100;
      _s.mapmaker.maxHexesInCountry = 100;
      await Mapmaker.addCountry(gameId, true);
    } finally {
      _.extend(_s.mapmaker, sizes);
    }
  }

  async function _testCleanup(gameId) {
    await Games.removeAsync(gameId);
    await Players.removeAsync({gameId: gameId});
    await Castles.removeAsync({gameId: gameId});
    await Market.removeAsync({gameId: gameId});
    await Markethistory.removeAsync({gameId: gameId});
    await Gamesignups.removeAsync({gameId: gameId});
    await Hexes.removeAsync({gameId: gameId});
    await Countries.removeAsync({gameId: gameId});
    await Capitals.removeAsync({gameId: gameId});
  }

  async function _testCleanupUser(userId) {
    await Meteor.users.removeAsync(userId);
  }


  dTest.helpers = {
    assert: _testAssert,
    equal: _testEqual,
    createTestGame: _createTestGame,
    createTestUser: _createTestUser,
    cleanup: _testCleanup,
    cleanupUser: _testCleanupUser
  };


  dTest.addSuite('game creation', async function(run) {

      // --- Guard ---

      await run('runAllTests and runGameCreationTests refuse client calls and change nothing', async function() {
        let collections = [Games, Players, Armies, Castles, Alerts, GlobalAlerts, Dailystats];
        let counts = async function() { return (await dTest.mapAsync(collections, async function(c) { return await c.find().countAsync(); })).join(','); };
        let before = await counts();
        await dTest.eachAsync(['runAllTests', 'runGameCreationTests'], async function(method) {
          await dTest.eachAsync([null, 'someUserId'], async function(userId) {
            let inv = {userId: userId, isSimulation: false, connection: {id: 'fakeClient'}, unblock: function() {}};
            let error = null;
            try {
              await DDP._CurrentInvocation.withValue(inv, async function() {
                return await Meteor.server.method_handlers[method].apply(inv, []);
              });
            } catch (e) {
              error = e;
            }
            // logged out calls are refused by server/methodGate.js before the method runs
            let expected = userId ? 'not-allowed' : 'not-authorized';
            _testAssert(error && error.error === expected, method + ' client call throws ' + expected + ' (userId ' + userId + ')');
          });
        });
        _testEqual(await counts(), before, 'no collection counts changed');
      });



      await run('game insert has correct default flags', async function() {
        let game = await _createTestGame();
        let doc = await Games.findOneAsync(game._id);
        _testAssert(doc.hasStarted === false, 'hasStarted');
        _testAssert(doc.isStarting === false, 'isStarting');
        _testAssert(doc.hasEnded === false, 'hasEnded');
        _testAssert(doc.hasClosed === false, 'hasClosed');
        _testAssert(doc.dominusAchieved === false, 'dominusAchieved');
        _testEqual(doc.numPlayers, 0, 'numPlayers');
        _testEqual(doc.taxesCollected, 0, 'taxesCollected');
        _testAssert(doc.closeDate === null, 'closeDate');
        _testAssert(doc.endDate === null, 'endDate');
        await _testCleanup(game._id);
      });

      await run('startGame transitions to started state', async function() {
        let game = await _createTestGame();
        let user = await _createTestUser();
        await Gamesignups.insertAsync({gameId: game._id, userId: user._id, username: user.username, createdAt: new Date(), usedToken: false});
        await Mapmaker.eraseMap(game._id);
        await _addTestCountry(game._id);

        await dManager.startGame(game, true);

        let g = await Games.findOneAsync(game._id);
        _testAssert(g.hasStarted === true, 'hasStarted');
        _testAssert(g.startedAt !== undefined, 'startedAt set');
        _testEqual(await Gamesignups.find({gameId: game._id}).countAsync(), 0, 'signups removed');
        _testEqual(await Players.find({gameId: game._id}).countAsync(), 1, 'player created');
        _testEqual(await Market.find({gameId: game._id}).countAsync(), _s.market.types.length, 'market created');
        await _testCleanup(game._id);
        await _testCleanupUser(user._id);
      });

      await run('startGame with zero signups works', async function() {
        let game = await _createTestGame();
        await dManager.startGame(game, true);
        let g = await Games.findOneAsync(game._id);
        _testAssert(g.hasStarted === true, 'hasStarted');
        _testEqual(await Market.find({gameId: game._id}).countAsync(), _s.market.types.length, 'market created');
        await _testCleanup(game._id);
      });


      // --- Player Creation ---

      await run('createPlayer correct starting resources', async function() {
        let game = await _createTestGame({hasStarted: true});
        let user = await _createTestUser();
        await Mapmaker.eraseMap(game._id);
        await _addTestCountry(game._id);

        let playerId = await dCastles.createPlayer(game._id, user._id, user.username, false);
        _testAssert(!!playerId, 'playerId returned');
        let p = await Players.findOneAsync(playerId);
        _testEqual(p.gold, _s.init.startingResources.gold, 'gold');
        _testEqual(p.grain, _s.init.startingResources.grain, 'grain');
        _testEqual(p.lumber, _s.init.startingResources.lumber, 'lumber');
        _testEqual(p.ore, _s.init.startingResources.ore, 'ore');
        _testEqual(p.wool, _s.init.startingResources.wool, 'wool');
        _testEqual(p.clay, _s.init.startingResources.clay, 'clay');
        _testEqual(p.glass, _s.init.startingResources.glass, 'glass');
        await _testCleanup(game._id);
        await _testCleanupUser(user._id);
      });

      await run('createPlayer crazyFast boosted resources', async function() {
        let game = await _createTestGame({hasStarted: true, isCrazyFast: true});
        let user = await _createTestUser();
        await Mapmaker.eraseMap(game._id);
        await _addTestCountry(game._id);

        let playerId = await dCastles.createPlayer(game._id, user._id, user.username, false);
        _testAssert(!!playerId, 'playerId returned');
        let p = await Players.findOneAsync(playerId);
        _testEqual(p.gold, 10000, 'gold');
        _testEqual(p.grain, 1500, 'grain');
        _testEqual(p.lumber, 2000, 'lumber');
        _testEqual(p.ore, 1500, 'ore');
        _testEqual(p.wool, 1500, 'wool');
        _testEqual(p.clay, 2000, 'clay');
        _testEqual(p.glass, 1500, 'glass');
        await _testCleanup(game._id);
        await _testCleanupUser(user._id);
      });

      await run('createPlayer rejects duplicate', async function() {
        let game = await _createTestGame({hasStarted: true});
        let user = await _createTestUser();
        await Mapmaker.eraseMap(game._id);
        await _addTestCountry(game._id);

        let id1 = await dCastles.createPlayer(game._id, user._id, user.username, false);
        _testAssert(!!id1, 'first succeeds');
        let id2 = await dCastles.createPlayer(game._id, user._id, user.username, false);
        _testAssert(!id2, 'second returns false');
        _testEqual(await Players.find({gameId: game._id}).countAsync(), 1, 'one player');
        await _testCleanup(game._id);
        await _testCleanupUser(user._id);
      });

      await run('createPlayer rejects when dominusAchieved', async function() {
        let game = await _createTestGame({hasStarted: true, dominusAchieved: true});
        let user = await _createTestUser();
        let playerId = await dCastles.createPlayer(game._id, user._id, user.username, false);
        _testAssert(!playerId, 'returns false');
        await _testCleanup(game._id);
        await _testCleanupUser(user._id);
      });

      await run('createPlayer creates castle at valid hex', async function() {
        let game = await _createTestGame({hasStarted: true});
        let user = await _createTestUser();
        await Mapmaker.eraseMap(game._id);
        await _addTestCountry(game._id);

        let playerId = await dCastles.createPlayer(game._id, user._id, user.username, false);
        let p = await Players.findOneAsync(playerId);
        _testAssert(p.x !== null, 'x set');
        _testAssert(p.y !== null, 'y set');
        _testAssert(p.castle_id !== null, 'castle_id set');
        let castle = await Castles.findOneAsync(p.castle_id);
        _testAssert(castle !== undefined, 'castle exists');
        _testEqual(castle.x, p.x, 'castle x');
        _testEqual(castle.y, p.y, 'castle y');
        await _testCleanup(game._id);
        await _testCleanupUser(user._id);
      });

      await run('createPlayer rejects unverified email', async function() {
        let game = await _createTestGame({hasStarted: true});
        let user = await _createTestUser({verifiedEmail: false});
        let playerId = await dCastles.createPlayer(game._id, user._id, user.username, false);
        _testAssert(!playerId, 'returns false');
        await _testCleanup(game._id);
        await _testCleanupUser(user._id);
      });


      // --- Market Creation ---

      await run('createMarket creates one doc per resource type', async function() {
        let game = await _createTestGame();
        await dMarket.createMarket(game._id);
        _testEqual(await Market.find({gameId: game._id}).countAsync(), _s.market.types.length, 'count');
        await dTest.eachAsync(_s.market.types, async function(type) {
          _testAssert(await Market.findOneAsync({gameId: game._id, type: type}) !== undefined, type + ' exists');
        });
        await _testCleanup(game._id);
      });

      await run('createMarket correct starting prices', async function() {
        let game = await _createTestGame();
        await dMarket.createMarket(game._id);
        await Market.find({gameId: game._id}).forEachAsync(function(doc) {
          _testEqual(doc.price, _s.market.startPrice[doc.type], doc.type + ' price');
        });
        await _testCleanup(game._id);
      });

      await run('createMarket is idempotent', async function() {
        let game = await _createTestGame();
        await dMarket.createMarket(game._id);
        await dMarket.createMarket(game._id);
        _testEqual(await Market.find({gameId: game._id}).countAsync(), _s.market.types.length, 'no dupes');
        await _testCleanup(game._id);
      });


      // --- Signup Validation ---

      await run('signup after startAt is detectable', async function() {
        let game = await _createTestGame({startAt: moment().subtract(1, 'day').toDate()});
        _testAssert(moment().isAfter(moment(game.startAt)), 'past startAt detected');
        await _testCleanup(game._id);
      });

      await run('signup full game is detectable', async function() {
        let game = await _createTestGame({maxPlayers: 2});
        for (let i = 0; i < 3; i++) {
          await Gamesignups.insertAsync({gameId: game._id, userId: 'fake' + i, username: 'p' + i, createdAt: new Date(), usedToken: false});
        }
        _testAssert(await Gamesignups.find({gameId: game._id}).countAsync() > game.maxPlayers, 'over max');
        await _testCleanup(game._id);
      });


      // --- Auto Game Creation ---

      await run('createNextGame creates game with correct fields', async function() {
        await Games.removeAsync({});
        let gameId = await dManager.createNextGame();
        _testAssert(!!gameId, 'gameId returned');
        let g = await Games.findOneAsync(gameId);
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
        await Games.removeAsync(gameId);
      });

      await run('createNextGame names first game "Game 1"', async function() {
        await Games.removeAsync({});
        let gameId = await dManager.createNextGame();
        _testEqual((await Games.findOneAsync(gameId)).name, 'Game 1', 'first game name');
        await Games.removeAsync(gameId);
      });

      await run('createNextGame names sequentially', async function() {
        await Games.removeAsync({});
        // insert a "Game 3" as if it existed before
        let oldId = await Games.insertAsync({name: 'Game 3', createdAt: new Date(), hasStarted: true, hasClosed: true});
        let gameId = await dManager.createNextGame();
        _testEqual((await Games.findOneAsync(gameId)).name, 'Game 4', 'sequential name');
        await Games.removeAsync(gameId);
        await Games.removeAsync(oldId);
      });

      await run('createNextGame handles non-standard previous name', async function() {
        await Games.removeAsync({});
        let oldId = await Games.insertAsync({name: 'My Custom Game', createdAt: new Date(), hasStarted: true, hasClosed: true});
        let gameId = await dManager.createNextGame();
        _testEqual((await Games.findOneAsync(gameId)).name, 'Game 1', 'fallback to Game 1');
        await Games.removeAsync(gameId);
        await Games.removeAsync(oldId);
      });

      await run('createNextGame does not create duplicate', async function() {
        await Games.removeAsync({});
        let id1 = await dManager.createNextGame();
        let id2 = await dManager.createNextGame();
        _testAssert(!!id1, 'first creates');
        _testAssert(!id2, 'second returns null');
        _testEqual(await Games.find({hasStarted: false, hasClosed: false}).countAsync(), 1, 'only one pending');
        await Games.removeAsync(id1);
      });

      await run('createNextGame startAt is ~72 hours in future', async function() {
        await Games.removeAsync({});
        let gameId = await dManager.createNextGame();
        let g = await Games.findOneAsync(gameId);
        let diff = g.startAt.getTime() - new Date().getTime();
        let hours = diff / (1000 * 60 * 60);
        _testAssert(hours > 71 && hours < 73, 'startAt ~72h from now (got ' + hours.toFixed(1) + 'h)');
        await Games.removeAsync(gameId);
      });

      await run('createNextGame picks highest game number', async function() {
        await Games.removeAsync({});
        let id1 = await Games.insertAsync({name: 'Game 5', createdAt: new Date('2020-01-01'), hasStarted: true, hasClosed: true});
        let id2 = await Games.insertAsync({name: 'Game 2', createdAt: new Date('2021-01-01'), hasStarted: true, hasClosed: true});
        let id3 = await Games.insertAsync({name: 'Game 10', createdAt: new Date('2019-01-01'), hasStarted: true, hasClosed: true});
        let gameId = await dManager.createNextGame();
        _testEqual((await Games.findOneAsync(gameId)).name, 'Game 11', 'picks highest N + 1');
        await Games.removeAsync(gameId);
        await Games.removeAsync(id1);
        await Games.removeAsync(id2);
        await Games.removeAsync(id3);
      });

      await run('dominus achievement creates next game', async function() {
        await Games.removeAsync({});
        await Players.removeAsync({});
        let game = await _createTestGame({hasStarted: true});
        let user1 = await _createTestUser({username: 'king_' + Random.id(4)});
        let user2 = await _createTestUser({username: 'vassal_' + Random.id(4)});

        // create king with vassal (dominus condition)
        let p1 = await Players.insertAsync({gameId: game._id, userId: user1._id, username: user1.username, is_king: true, king: null, castle_id: 'c1', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});
        let p2 = await Players.insertAsync({gameId: game._id, userId: user2._id, username: user2.username, is_king: false, king: p1, castle_id: 'c2', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});

        await dManager.checkForDominus(game._id);

        // verify new game was created
        let newGame = await Games.findOneAsync({hasStarted: false, hasClosed: false, _id: {$ne: game._id}});
        _testAssert(!!newGame, 'new game created');
        _testEqual(newGame.name, 'Game 1', 'new game named Game 1');

        await _testCleanup(game._id);
        if (newGame) await Games.removeAsync(newGame._id);
        await _testCleanupUser(user1._id);
        await _testCleanupUser(user2._id);
      });

      await run('re-achieving dominus does not create second game', async function() {
        await Games.removeAsync({});
        await Players.removeAsync({});
        let game = await _createTestGame({hasStarted: true});
        let user1 = await _createTestUser({username: 'king_' + Random.id(4)});
        let user2 = await _createTestUser({username: 'vassal_' + Random.id(4)});

        // dominus condition
        let p1 = await Players.insertAsync({gameId: game._id, userId: user1._id, username: user1.username, is_king: true, king: null, castle_id: 'c1', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});
        let p2 = await Players.insertAsync({gameId: game._id, userId: user2._id, username: user2.username, is_king: false, king: p1, castle_id: 'c2', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});

        // first dominus
        await dManager.checkForDominus(game._id);
        let count1 = await Games.find({hasStarted: false, hasClosed: false, _id: {$ne: game._id}}).countAsync();
        _testEqual(count1, 1, 'one pending game after first dominus');

        // simulate losing dominus then re-achieving
        await Players.updateAsync(p2, {$set: {is_king: true, king: null}});
        await dManager.checkForDominus(game._id); // no dominus now
        await Players.updateAsync(p2, {$set: {is_king: false, king: p1}});
        await dManager.checkForDominus(game._id); // dominus again

        let count2 = await Games.find({hasStarted: false, hasClosed: false, _id: {$ne: game._id}}).countAsync();
        _testEqual(count2, 1, 'still only one pending game');

        await _testCleanup(game._id);
        await Games.removeAsync({hasStarted: false, hasClosed: false});
        await _testCleanupUser(user1._id);
        await _testCleanupUser(user2._id);
      });

      await run('auto-created game compatible with checkForGameStart', async function() {
        await Games.removeAsync({});
        let gameId = await dManager.createNextGame();
        let g = await Games.findOneAsync(gameId);
        // checkForGameStart query: {hasStarted:false, isStarting:false, startAt:{$lte:new Date()}}
        _testEqual(g.hasStarted, false, 'hasStarted false');
        _testEqual(g.isStarting, false, 'isStarting false');
        _testAssert(g.startAt instanceof Date, 'startAt is Date');
        // simulate time passing: if startAt were in the past, it would match
        let query = {_id: gameId, hasStarted: false, isStarting: false, startAt: {$lte: moment().add(73, 'hours').toDate()}};
        _testAssert(!!await Games.findOneAsync(query), 'matches checkForGameStart query when time passes');
        await Games.removeAsync(gameId);
      });


      // --- Nightly Rebuild ---

      await run('no-king rebuild window does not clear dominus or fire false alert', async function() {
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
        await Games.removeAsync({});
        await Players.removeAsync({});
        await Alerts.removeAsync({});
        await GlobalAlerts.removeAsync({});
        let game = await _createTestGame({hasStarted: true});
        let user1 = await _createTestUser({username: 'king_' + Random.id(4)});
        let user2 = await _createTestUser({username: 'vassal_' + Random.id(4)});

        let p1 = await Players.insertAsync({gameId: game._id, userId: user1._id, username: user1.username, is_king: true, king: null, lord: null, castle_id: 'c1', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});
        let p2 = await Players.insertAsync({gameId: game._id, userId: user2._id, username: user2.username, is_king: false, king: p1, lord: p1, castle_id: 'c2', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});

        // establish dominus
        await dManager.checkForDominus(game._id);
        _testAssert((await Players.findOneAsync(p1, {fields:{is_dominus:1}})).is_dominus === true, 'p1 is dominus');
        await Alerts.removeAsync({gameId: game._id});
        await GlobalAlerts.removeAsync({gameId: game._id});

        // simulate the mid-rebuild window: is_king:false committed for everyone
        // (relation_finder set it and hasn't restored is_king:true yet)
        await Players.updateAsync({gameId: game._id}, {$set: {is_king: false}}, {multi: true});
        await dManager.checkForDominus(game._id);

        // fix: a transient no-king read is ignored -> dominus preserved, no alert
        _testAssert((await Players.findOneAsync(p1, {fields:{is_dominus:1}})).is_dominus === true, 'dominus preserved during no-king window');
        _testEqual(await Alerts.find({gameId: game._id, type: 'alert_noLongerDominus'}).countAsync(), 0, 'no false noLongerDominus alert');

        await Alerts.removeAsync({gameId: game._id});
        await GlobalAlerts.removeAsync({gameId: game._id});
        await _testCleanup(game._id);
        await Games.removeAsync({hasStarted: false, hasClosed: false});
        await _testCleanupUser(user1._id);
        await _testCleanupUser(user2._id);
      });

      await run('nightly rebuild + checkForDominus does not send false alert', async function() {
        // Full nightly flow: rebuildRelationships then checkForDominus.
        // With the fix (synchronous bulk.execute), is_king is correctly
        // committed before checkForDominus queries it.
        await Games.removeAsync({});
        await Players.removeAsync({});
        await Alerts.removeAsync({});
        await GlobalAlerts.removeAsync({});
        let game = await _createTestGame({hasStarted: true});
        let user1 = await _createTestUser({username: 'king_' + Random.id(4)});
        let user2 = await _createTestUser({username: 'vassal_' + Random.id(4)});
        let user3 = await _createTestUser({username: 'vassal2_' + Random.id(4)});

        let p1 = await Players.insertAsync({gameId: game._id, userId: user1._id, username: user1.username, is_king: true, king: null, lord: null, castle_id: 'c1', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});
        let p2 = await Players.insertAsync({gameId: game._id, userId: user2._id, username: user2.username, is_king: false, king: p1, lord: p1, castle_id: 'c2', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});
        let p3 = await Players.insertAsync({gameId: game._id, userId: user3._id, username: user3.username, is_king: false, king: p1, lord: p1, castle_id: 'c3', is_dominus: false, vassals: [], allies_above: [], allies_below: [], team: []});

        // establish dominus
        await dManager.checkForDominus(game._id);
        _testAssert((await Players.findOneAsync(p1, {fields:{is_dominus:1}})).is_dominus === true, 'p1 is dominus');
        await Alerts.removeAsync({gameId: game._id});
        await GlobalAlerts.removeAsync({gameId: game._id});

        // simulate midnight: rebuild relationships then check dominus
        await dInit.rebuildRelationships(game._id);
        await dManager.checkForDominus(game._id);

        // dominus should be unchanged, no false alerts
        _testAssert((await Players.findOneAsync(p1, {fields:{is_dominus:1}})).is_dominus === true, 'p1 still dominus after rebuild');
        _testEqual(await Alerts.find({gameId: game._id, type: 'alert_noLongerDominus'}).countAsync(), 0, 'no false noLongerDominus alert');
        _testEqual(await GlobalAlerts.find({gameId: game._id, type: 'ga_newDominus'}).countAsync(), 0, 'no false newDominus global alert');

        await Alerts.removeAsync({gameId: game._id});
        await GlobalAlerts.removeAsync({gameId: game._id});
        await _testCleanup(game._id);
        await Games.removeAsync({hasStarted: false, hasClosed: false});
        await _testCleanupUser(user1._id);
        await _testCleanupUser(user2._id);
        await _testCleanupUser(user3._id);
      });


      // --- Account deletion: orphan subtree ---

      await run('deleting a lord with a missing super-lord promotes its vassals to kings', async function() {
        // Regression test for fix/dominus-orphan-subtree. When a deleted
        // player's `lord` points at a doc that no longer exists,
        // deleteGameAccount used to skip vassal reparenting (the if(lord) block
        // had no else), orphaning the subtree: vassals left is_king:false with a
        // dangling lord, invisible to the tree/rebuild but still counted by
        // checkForDominus -> unwinnable game. The fix promotes them to kings.
        await Games.removeAsync({}); await Players.removeAsync({});
        let game = await _createTestGame({hasStarted: true});
        let uP = await _createTestUser();
        let uV = await _createTestUser();

        // P points at a missing lord and has one vassal V.
        let pId = await Players.insertAsync({gameId: game._id, userId: uP._id, username: uP.username,
          is_king: false, lord: 'ghost-missing-lord', king: 'ghost-missing-lord',
          vassals: [], allies_above: ['ghost-missing-lord'], allies_below: [], team: [], castle_id: 'cP'});
        let vId = await Players.insertAsync({gameId: game._id, userId: uV._id, username: uV.username,
          is_king: false, lord: pId, king: 'ghost-missing-lord',
          vassals: [], allies_above: [pId, 'ghost-missing-lord'], allies_below: [], team: [], castle_id: 'cV'});
        await Players.updateAsync(pId, {$set: {vassals: [vId], allies_below: [vId]}});

        await dGame.deleteGameAccount(pId);

        let v = await Players.findOneAsync(vId, {fields: {is_king: 1, lord: 1}});
        _testAssert(!!v, 'vassal still exists');
        _testAssert(v.is_king === true, 'orphaned vassal promoted to king');
        _testAssert(v.lord === null, 'orphaned vassal has no dangling lord');
        _testAssert(!await Players.findOneAsync(pId), 'deleted player removed');

        await Alerts.removeAsync({gameId: game._id});
        await GlobalAlerts.removeAsync({gameId: game._id});
        await Armies.removeAsync({gameId: game._id});
        await Villages.removeAsync({gameId: game._id});
        await Markers.removeAsync({gameId: game._id});
        await _testCleanup(game._id);
        await Games.removeAsync({hasStarted: false, hasClosed: false});
        await _testCleanupUser(uP._id);
        await _testCleanupUser(uV._id);
      });




      // --- Auth: disbandArmy ownership ---

      await run('disbandArmy rejects a non-owner and keeps the army', async function() {
        // Regression test for fix/auth-disband-army. disbandArmy -> destroyArmy
        // looked the army up by _id only, so any player could delete any army.
        // The fix requires the caller to own it.
        await Games.removeAsync({}); await Players.removeAsync({}); await Armies.removeAsync({});
        let game = await _createTestGame({hasStarted: true});
        let owner = await _createTestUser();
        let attacker = await _createTestUser();

        let armyId = await Armies.insertAsync({gameId: game._id, user_id: owner._id, playerId: 'pOwner',
          x: 0, y: 0, footmen: 5, name: 'testarmy'});

        // invoke the method handler with a chosen this.userId
        function callAs(userId, method, args) {
          var inv = {userId: userId, isSimulation: false, connection: null, unblock: function() {}};
          return DDP._CurrentInvocation.withValue(inv, async function() {
            return await Meteor.server.method_handlers[method].apply(inv, args);
          });
        }

        var threw = false;
        try { await callAs(attacker._id, 'disbandArmy', [game._id, armyId]); } catch (e) { threw = true; }
        _testAssert(threw, 'non-owner disbandArmy throws');
        _testEqual(await Armies.find({_id: armyId}).countAsync(), 1, 'army survives the non-owner attempt');

        // no regression: the owner can disband their own army
        await callAs(owner._id, 'disbandArmy', [game._id, armyId]);
        _testEqual(await Armies.find({_id: armyId}).countAsync(), 0, 'owner can disband own army');

        await Armies.removeAsync({gameId: game._id});
        await _testCleanup(game._id);
        await _testCleanupUser(owner._id);
        await _testCleanupUser(attacker._id);
      });


      // --- Battle calculator: dominus ally/enemy ---

      await run('dominus army is enemy-not-ally of its own vassal', function() {
        // Regression test for fix/dominus-attack-ally-enemy. isEnemy has a
        // dominus override (a dominus can attack anyone's armies); isAlly must
        // have a matching override so a dominus and its own vassal are never
        // BOTH enemy and ally (which double-counts the vassal's power in the
        // battle round). Pure calculator test -- no DB.
        //
        // D is dominus; V is D's direct vassal. Relation from D's view is
        // 'direct_vassal' (V in D.team, D.allies_below, D.vassals).
        var D = new BattleArmy();
        D.unitType = 'army'; D.playerId = 'D'; D.is_dominus = true;
        D.king = 'D'; D.lord = null; D.team = ['V']; D.allies_above = [];
        D.allies_below = ['V']; D.vassals = ['V'];

        var V = new BattleArmy();
        V.unitType = 'army'; V.playerId = 'V'; V.is_dominus = false;
        V.king = 'D'; V.lord = 'D'; V.team = ['D']; V.allies_above = ['D'];
        V.allies_below = []; V.vassals = [];

        _testAssert(D.isEnemy(V) === true, 'dominus is enemy of its vassal (can attack any army)');
        _testAssert(D.isAlly(V) === false, 'dominus is NOT also an ally of its vassal');

        // no regression: with D not a dominus, its vassal is a normal ally.
        D.is_dominus = false;
        _testAssert(D.isAlly(V) === true, 'non-dominus lord is an ally of its vassal');
        _testAssert(D.isEnemy(V) === false, 'non-dominus lord is not an enemy of its vassal');
      });


      // --- Auth: splitArmy ownership ---

      await run('splitArmy rejects a non-owner and leaves the army intact', async function() {
        // Regression test for fix/auth-split-army. splitArmy -> dArmies.split
        // looked the army up by _id only (and reset its speed/moveTime), so any
        // player could stop and fragment an enemy army. The fix requires
        // ownership.
        await Games.removeAsync({}); await Players.removeAsync({}); await Armies.removeAsync({});
        let game = await _createTestGame({hasStarted: true});
        let owner = await _createTestUser();
        let attacker = await _createTestUser();

        let armyId = await Armies.insertAsync({gameId: game._id, user_id: owner._id, playerId: 'pOwner',
          x: 0, y: 0, footmen: 10, archers: 0, pikemen: 0, cavalry: 0, catapults: 0,
          speed: 5, moveTime: 123, name: 'testarmy'});

        function callAs(userId, method, args) {
          var inv = {userId: userId, isSimulation: false, connection: null, unblock: function() {}};
          return DDP._CurrentInvocation.withValue(inv, async function() {
            return await Meteor.server.method_handlers[method].apply(inv, args);
          });
        }

        var threw = false;
        try { await callAs(attacker._id, 'splitArmy', [game._id, armyId, {footmen: 5}]); } catch (e) { threw = true; }
        _testAssert(threw, 'non-owner splitArmy throws');
        _testEqual(await Armies.find({gameId: game._id}).countAsync(), 1, 'no new army was split off');
        let a = await Armies.findOneAsync(armyId);
        _testEqual(a.footmen, 10, 'original army soldiers untouched');
        _testEqual(a.speed, 5, 'original army movement not reset by a non-owner');

        await Armies.removeAsync({gameId: game._id});
        await _testCleanup(game._id);
        await _testCleanupUser(owner._id);
        await _testCleanupUser(attacker._id);
      });


      // --- Auth: change_username scoping ---

      await run('change_username cannot rename another player or their castle', async function() {
        // Regression test for fix/auth-change-username. The Players write was
        // userId-scoped, but the denormalized Castle/Village/Army/Room renames
        // used playerId only, so passing a victim's playerId renamed their
        // units. The fix loads the player scoped to the caller and bails.
        await Games.removeAsync({}); await Players.removeAsync({}); await Castles.removeAsync({});
        let game = await _createTestGame({hasStarted: true});
        let victim = await _createTestUser();
        let attacker = await _createTestUser();

        let victimPid = await Players.insertAsync({gameId: game._id, userId: victim._id, username: 'VictimName', is_king: false});
        let castleId = await Castles.insertAsync({gameId: game._id, playerId: victimPid, user_id: victim._id, username: 'VictimName', x: 0, y: 0});

        function callAs(userId, method, args) {
          var inv = {userId: userId, isSimulation: false, connection: null, unblock: function() {}};
          return DDP._CurrentInvocation.withValue(inv, async function() {
            return await Meteor.server.method_handlers[method].apply(inv, args);
          });
        }

        var threw = false;
        try { await callAs(attacker._id, 'change_username', [victimPid, 'Hacked']); } catch (e) { threw = true; }
        _testAssert(threw, 'renaming another player throws');
        _testEqual((await Castles.findOneAsync(castleId)).username, 'VictimName', 'victim castle username unchanged');
        _testEqual((await Players.findOneAsync(victimPid)).username, 'VictimName', 'victim player username unchanged');

        await Castles.removeAsync({gameId: game._id});
        await _testCleanup(game._id);
        await _testCleanupUser(victim._id);
        await _testCleanupUser(attacker._id);
      });


      // --- Battle calculator: casualty count ---

      await run('findLoses spends all affordable power (no early exit)', function() {
        // Regression test for fix/battle-casualty-undercount. findLoses removes
        // soldiers worth powerToLose. The old code used a `fails` counter that
        // accumulated across passes, so an army holding a persistently
        // unaffordable expensive unit exited early while cheaper units it should
        // still lose remained -- an under-count. Pure calculator test, no DB.
        //
        // 100 footmen at power 1 (cheap) + 1 catapult at power 100 (never
        // affordable here). powerToLose = 20 -> exactly 20 footmen should die.
        // Pre-fix stopped after ~types.length footmen because the catapult
        // failed every pass; post-fix removes all 20.
        var a = new BattleArmy();
        a.unitType = 'army';
        a.enemies = [];
        a.finalPowerPerSoldier = {};
        _s.armies.types.forEach(function(t) { a.units[t] = 0; a.finalPowerPerSoldier[t] = 0; });
        a.units.footmen = 100;
        a.units.catapults = 1;
        a.finalPowerPerSoldier.footmen = 1;
        a.finalPowerPerSoldier.catapults = 100;
        a.numUnits = 101;
        a.powerToLose = 20;

        a.findLoses();

        _testEqual(a.loses.footmen, 20, 'all 20 affordable footmen are lost');
        _testEqual(a.loses.catapults, 0, 'unaffordable catapult is not lost');
        // destroyed is only initialised by resetInfo(), which a real battle calls
        // first, so on this bare army it is undefined unless findLoses sets it
        _testAssert(a.destroyed !== true, 'army with survivors is not destroyed');
      });


      // --- Economy: send_gold_to atomic debit ---

      await run('send_gold_to rejects overspend and debits a valid send correctly', async function() {
        // Correctness / no-regression test for fix/economy-send-gold-toctou,
        // which reordered the transfer to debit the sender first via a
        // conditional update ({_id, gold:{$gte:amount}}). The true concurrency
        // fix (two simultaneous calls can't both pass the balance check) is not
        // reproducible in a single-threaded test, so this asserts the reorder
        // still rejects an overspend without corrupting gold and that a valid
        // send debits the sender by the exact amount.
        await Games.removeAsync({}); await Players.removeAsync({});
        let game = await _createTestGame({hasStarted: true});
        let uSender = await _createTestUser();
        let uRecip = await _createTestUser();

        let recipPid = await Players.insertAsync({gameId: game._id, userId: uRecip._id, username: 'recip', gold: 0});
        let senderPid = await Players.insertAsync({gameId: game._id, userId: uSender._id, username: 'sender', gold: 10, allies_below: [recipPid]});

        function callAs(userId, method, args) {
          var inv = {userId: userId, isSimulation: false, connection: null, unblock: function() {}};
          return DDP._CurrentInvocation.withValue(inv, async function() {
            return await Meteor.server.method_handlers[method].apply(inv, args);
          });
        }

        var threw = false;
        try { await callAs(uSender._id, 'send_gold_to', [game._id, recipPid, 100]); } catch (e) { threw = true; }
        _testAssert(threw, 'overspend throws');
        _testEqual((await Players.findOneAsync(senderPid)).gold, 10, 'sender gold unchanged after failed overspend (never negative)');

        // valid send: sender is debited by exactly the amount
        await callAs(uSender._id, 'send_gold_to', [game._id, recipPid, 4]);
        _testEqual((await Players.findOneAsync(senderPid)).gold, 6, 'sender debited by amount on a valid send');

        await _testCleanup(game._id);
        await _testCleanupUser(uSender._id);
        await _testCleanupUser(uRecip._id);
      });


      // --- Rankings: tie collapse including zero ---

      await run('vassal/income ranks collapse ties including zero values', async function() {
        // Regression test for fix/rankings-tie-zero. The dense ranking used
        // `if (prevNumVassals)` / `if (prevIncome)`, so a previous value of 0
        // (the common case) was treated as "no previous" and inflated ranks.
        // [5,5,0,0,0] used to rank 1,2,2,3,4 instead of 1,1,2,2,2.
        await Games.removeAsync({}); await Players.removeAsync({}); await Dailystats.removeAsync({});
        let game = await _createTestGame({hasStarted: true, startedAt: new Date()});
        let mk = async function(n) {
          return await Players.insertAsync({gameId: game._id, userId: 'u_' + Random.id(5), username: 'p_' + Random.id(3),
            num_allies_below: n, income: n, is_king: false, king: null, lord: null, vassals: [],
            allies_above: [], allies_below: [], team: [], castle_id: 'c_' + Random.id(3)});
        };
        let a = await mk(5), b = await mk(5), c = await mk(0), d = await mk(0), e = await mk(0);

        await dGraphs.updateVassalRank(game._id);
        let vrank = async function(pid) { let ds = await Dailystats.findOneAsync({playerId: pid}); return ds ? ds.vassalRank : null; };
        _testEqual(await vrank(a), 1, 'top vassal count is rank 1');
        _testEqual(await vrank(b), 1, 'tie with top is also rank 1');
        _testEqual(await vrank(c), 2, 'zero-vassal is rank 2');
        _testEqual(await vrank(d), 2, 'zero-vassal tie is rank 2');
        _testEqual(await vrank(e), 2, 'zero-vassal tie is rank 2');

        await dGraphs.updateIncomeRank(game._id);
        let irank = async function(pid) { let ds = await Dailystats.findOneAsync({playerId: pid}); return ds ? ds.incomeRank : null; };
        _testEqual(await irank(a), 1, 'top income is rank 1');
        _testEqual(await irank(b), 1, 'income tie with top is rank 1');
        _testEqual(await irank(c), 2, 'zero income is rank 2');

        await Dailystats.removeAsync({gameId: game._id});
        await _testCleanup(game._id);
      });

  });

  // The other suites, in the order they have always run. Looked up when the run
  // starts, since their files load after this one.
  dTest.addSuite('bugs found along the way (server/bugFixTests.js)', function(run, t) { return _bugFixTests(run, t); });
  dTest.addSuite('server performance fixes (server/perfFixTests.js)', function(run, t) { return _perfFixTests(run, t); });
  dTest.addSuite('job handlers are timed (server/jobTimingTests.js)', function(run, t) { return _jobTimingTests(run, t); });
  dTest.addSuite('spectators can\'t change a game (server/spectatorTests.js)', function(run, t) { return _spectatorTests(run, t); });
  dTest.addSuite('publications refuse missing arguments (server/publicationGateTests.js)', function(run, t) { return _publicationGateTests(run, t); });
  dTest.addSuite('every argument is checked (server/argumentCheckTests.js)', function(run, t) { return _argumentCheckTests(run, t); });
}
