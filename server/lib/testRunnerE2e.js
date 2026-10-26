// Fixtures for the browser tests in tests/e2e (T7 of the Meteor upgrade plan,
// Oct 2026). Loaded after server/lib/testRunner.js (same folder, sorts after
// it). The tests call these through meteor shell (tests/e2e/lib/server.js);
// no method exposes them.
//
// Everything they make is named e2e_* (users) or "E2E ..." (games), and
// dTest.e2e.reset() removes it again. Only use them on a local development
// database.

if (Meteor.isServer) {

  var refuseInProduction = function() {
    if (Meteor.isProduction) throw new Error('the browser test fixtures never run in production');
  };

  // a collection by its name in the code (Armypaths) or in Mongo (armypaths2)
  function collectionNamed(collectionName) {
    var byName = {Players: Players, Castles: Castles, Villages: Villages, Armies: Armies, Armypaths: Armypaths,
      Capitals: Capitals, Market: Market, Battles2: Battles2, Roomchats: Roomchats, Rooms: Rooms, Alerts: Alerts,
      Games: Games, Settings: Settings, Forumtopics: Forumtopics, Forumposts: Forumposts, users: Meteor.users,
      Markers: Markers, MarkerGroups: MarkerGroups, Gamesignups: Gamesignups, Hexes: Hexes, Rounds: Rounds, Countries: Countries};
    var collection = byName[collectionName] || _.find(dTest.gameCollections(), function(c) { return c._name == collectionName; });
    if (!collection) throw new Error('no collection ' + collectionName);
    return collection;
  }

  dTest.e2e = {

    // every e2e user's password
    password: 'e2e-password-1',

    // removes the users and games the browser tests made
    reset: async function() {
      refuseInProduction();
      var gameIds = await Games.find({name: /^E2E /}, {fields: {_id: 1}}).mapAsync(function(g) { return g._id; });
      await dTest.eachAsync(dTest.gameCollections().concat([Rounds]), async function(collection) {
        await collection.removeAsync({gameId: {$in: gameIds}});
      });
      await Games.removeAsync({_id: {$in: gameIds}});
      var userIds = await Meteor.users.find({username: /^e2e_/}, {fields: {_id: 1}}).mapAsync(function(u) { return u._id; });
      // the forum topics the tests start (all titled "E2E ..."), with every
      // reply in them, and any other post by an e2e user
      var topicIds = await Forumtopics.find({title: /^E2E /}, {fields: {_id: 1}}).mapAsync(function(t) { return t._id; });
      await Forumposts.removeAsync({$or: [{topicId: {$in: topicIds}}, {userId: {$in: userIds}}]});
      await Forumtopics.removeAsync({_id: {$in: topicIds}});
      await Markers.removeAsync({user_id: {$in: userIds}});
      await MarkerGroups.removeAsync({user_id: {$in: userIds}});
      await Players.removeAsync({userId: {$in: userIds}});
      await Gamesignups.removeAsync({userId: {$in: userIds}});
      await Meteor.users.removeAsync({_id: {$in: userIds}});
      return {games: gameIds.length, users: userIds.length, forumTopics: topicIds.length};
    },

    // A user that signs in with a password, made the way the sign up form
    // makes one. opts.admin makes them an admin.
    user: async function(name, opts) {
      refuseInProduction();
      opts = opts || {};
      var username = 'e2e_' + name;
      var userId = await Accounts.createUser({username: username, email: username + '@example.com', password: dTest.e2e.password});
      var set = {verifiedEmail: true, 'emails.0.verified': true, isNewUser: false};
      if (opts.admin) set.admin = true;
      await Meteor.users.updateAsync(userId, {$set: set});
      return {_id: userId, username: username, email: username + '@example.com'};
    },

    // A started game with a player for each name (dTest.buildGameWorld).
    // Returns its id and, for each name, the user, player and castle.
    world: async function(names, opts) {
      refuseInProduction();
      opts = opts || {};
      var users = await dTest.mapAsync(names, function(name) { return dTest.e2e.user(name, opts.admins && _.contains(opts.admins, name) ? {admin: true} : {}); });
      var w = await dTest.buildGameWorld({users: users, game: _.extend({name: 'E2E ' + names.join(' ')}, opts.game || {})});
      // the start job does this, but not for a test start (gameStartJob.js)
      await dChat.setupEveryoneChatroom(w.gameId);
      var out = {gameId: w.gameId, players: {}};
      await dTest.eachAsync(names, async function(name, i) {
        var castle = await w.castle(i);
        out.players[name] = {userId: users[i]._id, username: users[i].username, playerId: w.players[i]._id,
          castle: {_id: castle._id, x: castle.x, y: castle.y, name: castle.name}};
      });
      return out;
    },

    // A game that starts a week from now, open for signups. The name gets
    // "E2E " in front. opts are the game's fields, e.g. {isProOnly: true}.
    futureGame: async function(name, opts) {
      refuseInProduction();
      var game = _.extend({name: 'E2E ' + name, desc: 'An e2e game.', maxPlayers: 10,
        startAt: moment().add(7, 'days').toDate(), createdAt: new Date(), hasStarted: false, isStarting: false,
        hasEnded: false, hasClosed: false, numPlayers: 0, isRelaxed: false, isSpeed: false, isCrazyFast: false,
        isProOnly: false, isKingOfHill: false, isNoLargeResources: false}, opts || {});
      game._id = await Games.insertAsync(game);
      _gs.cacheGame(game);
      return game._id;
    },

    // sets fields on a user, e.g. {proTokens: 1}
    setUser: async function(userId, fields) {
      refuseInProduction();
      return await Meteor.users.updateAsync(userId, {$set: fields});
    },

    // a document, for checking what a click did
    findOne: async function(collectionName, selector) {
      refuseInProduction();
      return await collectionNamed(collectionName).findOneAsync(selector);
    },

    // how many documents match, e.g. to check a chat was saved once
    count: async function(collectionName, selector) {
      refuseInProduction();
      return await collectionNamed(collectionName).find(selector).countAsync();
    },

    // what a user has bought in the store, e.g. {castles: ['castle_03_skull']}
    setPurchases: async function(userId, purchases) {
      refuseInProduction();
      return await Meteor.users.updateAsync(userId, {$set: {purchases: purchases}});
    },

    // sets a player's resources and gold (the ones given)
    setResources: async function(playerId, values) {
      refuseInProduction();
      return await Players.updateAsync(playerId, {$set: _.pick(values, _s.market.types_plus_gold)});
    },

    // the free hex nearest to x,y that an army can stand on, at least
    // minDistance away, and of the type given (grain, ...) if one is
    freeHexNear: async function(gameId, x, y, minDistance, type) {
      refuseInProduction();
      var taken = {};
      await Castles.find({gameId: gameId}).forEachAsync(function(c) { taken[c.x + '_' + c.y] = true; });
      await Villages.find({gameId: gameId}).forEachAsync(function(v) { taken[v.x + '_' + v.y] = true; });
      var best = null;
      await Hexes.find(_.extend({gameId: gameId, hasBuilding: {$ne: true}}, type ? {type: type} : {}), {fields: {x: 1, y: 1}}).forEachAsync(function(h) {
        var d = Hx.hexDistance(x, y, h.x, h.y);
        if (taken[h.x + '_' + h.y] || d < (minDistance || 1)) return;
        if (!best || d < best.distance) best = {x: h.x, y: h.y, distance: d};
      });
      if (!best) throw new Error('no free hex near ' + x + ',' + y);
      return best;
    },

    // an army for a player at x,y, made the way the game makes one
    makeArmy: async function(playerId, soldiers, x, y) {
      refuseInProduction();
      var army = await dArmies.create(playerId, dTest.soldierCounts(soldiers), x, y);
      if (!army) throw new Error('could not make the army');
      return army._id;
    },

    // a finished level 1 village for a player at x,y, with no soldiers
    makeVillage: async function(playerId, x, y) {
      refuseInProduction();
      var player = await Players.findOneAsync(playerId);
      var id = await Villages.insertAsync(_.extend({gameId: player.gameId, x: x, y: y, playerId: player._id, user_id: player.userId,
        username: player.username, name: 'E2E village', level: 1, under_construction: false, created_at: new Date(),
        income: await dVillages.resourcesFromSurroundingHexes(player.gameId, x, y, _s.villages.num_rings_village)},
        dTest.soldierCounts({})));
      await Mapmaker.buildingAdded(player.gameId, x, y);
      return id;
    },

    // makes vassalId the vassal of lordId, as winning a battle does
    makeVassal: async function(lordId, vassalId) {
      refuseInProduction();
      await dInit.set_lord_and_vassal(lordId, vassalId);
      return (await Players.findOneAsync(lordId, {fields: {allies_below: 1}})).allies_below;
    },

    // sends an army to x,y, through addArmyPath as its owner
    sendArmy: async function(armyId, x, y) {
      refuseInProduction();
      var army = await Armies.findOneAsync(armyId);
      return await Meteor.server.method_handlers.addArmyPath.call({userId: army.user_id, isSimulation: false}, army.gameId, x, y, armyId);
    },

    // an army's paths, in order
    paths: async function(armyId) {
      refuseInProduction();
      return await Armypaths.find({armyId: armyId}, {sort: {index: 1}}).fetchAsync();
    },

    // Makes the game's armies due to move on, so the worker moves them within
    // a few seconds instead of minutes.
    hurryArmies: async function(gameId) {
      refuseInProduction();
      var past = moment().subtract(1, 'hour').toDate();
      return await Armypaths.updateAsync({gameId: gameId}, {$set: {last_move_at: past}}, {multi: true});
    },

    // the stats the graphs panel draws (a player's daily stats and the
    // game's stats) and the market history the market panel draws, one point
    // every 6 hours up to now
    makeStats: async function(gameId, playerId, points) {
      refuseInProduction();
      if (!/^E2E /.test((await Games.findOneAsync(gameId, {fields: {name: 1}}) || {}).name)) throw new Error('not an E2E game: ' + gameId);
      var player = await Players.findOneAsync(playerId);
      points = points || 8;
      for (var i = 0; i < points; i++) {
        var at = moment().subtract((points - 1 - i) * 6, 'hours').toDate();
        await Dailystats.insertAsync({gameId: gameId, user_id: player.userId, playerId: playerId, created_at: at, updated_at: at,
          totalIncome: 1000 + 100 * i, castleIncome: 600 + 50 * i, capitalIncome: 100, villageIncome: 200 + 50 * i, vassalIncome: 100,
          incomeRank: 1 + (i % 3), vassalRank: 1, numVassals: i % 4});
        var soldierWorth = {};
        _s.armies.types.forEach(function(type, n) { soldierWorth[type] = 100 * (n + 1) + 10 * i; });
        await Gamestats.insertAsync({gameId: gameId, created_at: at, num_users: 2 + i, soldierWorth: soldierWorth});
        var price = {};
        _s.market.types.forEach(function(type, n) { price[type] = 1 + n / 10 + i / 100; });
        await Markethistory.insertAsync({gameId: gameId, created_at: at, price: price, quantity: 50 + 10 * i});
      }
      return points;
    },

    // sets fields on an E2E game, e.g. {endDate: ...}
    setGame: async function(gameId, fields) {
      refuseInProduction();
      if (!/^E2E /.test((await Games.findOneAsync(gameId, {fields: {name: 1}}) || {}).name)) throw new Error('not an E2E game: ' + gameId);
      return await Games.updateAsync(gameId, {$set: fields});
    },

    // queues the jobs that draw an E2E game's minimap, as a new country does:
    // each country's border mask, which queues the game's minimap. The
    // worker runs them.
    queueMinimap: async function(gameId) {
      refuseInProduction();
      if (!/^E2E /.test((await Games.findOneAsync(gameId, {fields: {name: 1}}) || {}).name)) throw new Error('not an E2E game: ' + gameId);
      await Countries.find({gameId: gameId}, {fields: {_id: 1}}).forEachAsync(async function(country) {
        await Queues.addAsync('createCountryMask', {countryId: country._id}, {delay: 0, timeout: 1000 * 60}, country._id);
      });
      return await Countries.find({gameId: gameId}).countAsync();
    },

    // runs a cron's body now, e.g. '1 min job', so the worker takes the jobs
    // it adds within a few seconds instead of at the next tick
    runCron: async function(name) {
      refuseInProduction();
      var entry = SyncedCron._entries[name];
      if (!entry) throw new Error('no cron named ' + name);
      await entry.job();
      return true;
    }
  };
}
