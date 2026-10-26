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
    reset: function() {
      refuseInProduction();
      var gameIds = Games.find({name: /^E2E /}, {fields: {_id: 1}}).map(function(g) { return g._id; });
      dTest.gameCollections().concat([Rounds]).forEach(function(collection) {
        collection.remove({gameId: {$in: gameIds}});
      });
      Games.remove({_id: {$in: gameIds}});
      var userIds = Meteor.users.find({username: /^e2e_/}, {fields: {_id: 1}}).map(function(u) { return u._id; });
      // the forum topics the tests start (all titled "E2E ..."), with every
      // reply in them, and any other post by an e2e user
      var topicIds = Forumtopics.find({title: /^E2E /}, {fields: {_id: 1}}).map(function(t) { return t._id; });
      Forumposts.remove({$or: [{topicId: {$in: topicIds}}, {userId: {$in: userIds}}]});
      Forumtopics.remove({_id: {$in: topicIds}});
      Markers.remove({user_id: {$in: userIds}});
      MarkerGroups.remove({user_id: {$in: userIds}});
      Players.remove({userId: {$in: userIds}});
      Gamesignups.remove({userId: {$in: userIds}});
      Meteor.users.remove({_id: {$in: userIds}});
      return {games: gameIds.length, users: userIds.length, forumTopics: topicIds.length};
    },

    // A user that signs in with a password, made the way the sign up form
    // makes one. opts.admin makes them an admin.
    user: function(name, opts) {
      refuseInProduction();
      opts = opts || {};
      var username = 'e2e_' + name;
      var userId = Accounts.createUser({username: username, email: username + '@example.com', password: dTest.e2e.password});
      var set = {verifiedEmail: true, 'emails.0.verified': true, isNewUser: false};
      if (opts.admin) set.admin = true;
      Meteor.users.update(userId, {$set: set});
      return {_id: userId, username: username, email: username + '@example.com'};
    },

    // A started game with a player for each name (dTest.buildGameWorld).
    // Returns its id and, for each name, the user, player and castle.
    world: function(names, opts) {
      refuseInProduction();
      opts = opts || {};
      var users = names.map(function(name) { return dTest.e2e.user(name, opts.admins && _.contains(opts.admins, name) ? {admin: true} : {}); });
      var w = dTest.buildGameWorld({users: users, game: _.extend({name: 'E2E ' + names.join(' ')}, opts.game || {})});
      // the start job does this, but not for a test start (gameStartJob.js)
      dTest.settle(dChat.setupEveryoneChatroom(w.gameId));
      var out = {gameId: w.gameId, players: {}};
      names.forEach(function(name, i) {
        var castle = w.castle(i);
        out.players[name] = {userId: users[i]._id, username: users[i].username, playerId: w.players[i]._id,
          castle: {_id: castle._id, x: castle.x, y: castle.y, name: castle.name}};
      });
      return out;
    },

    // A game that starts a week from now, open for signups. The name gets
    // "E2E " in front. opts are the game's fields, e.g. {isProOnly: true}.
    futureGame: function(name, opts) {
      refuseInProduction();
      var game = _.extend({name: 'E2E ' + name, desc: 'An e2e game.', maxPlayers: 10,
        startAt: moment().add(7, 'days').toDate(), createdAt: new Date(), hasStarted: false, isStarting: false,
        hasEnded: false, hasClosed: false, numPlayers: 0, isRelaxed: false, isSpeed: false, isCrazyFast: false,
        isProOnly: false, isKingOfHill: false, isNoLargeResources: false}, opts || {});
      game._id = Games.insert(game);
      _gs.cacheGame(game);
      return game._id;
    },

    // sets fields on a user, e.g. {proTokens: 1}
    setUser: function(userId, fields) {
      refuseInProduction();
      return Meteor.users.update(userId, {$set: fields});
    },

    // a document, for checking what a click did
    findOne: function(collectionName, selector) {
      refuseInProduction();
      return collectionNamed(collectionName).findOne(selector);
    },

    // how many documents match, e.g. to check a chat was saved once
    count: function(collectionName, selector) {
      refuseInProduction();
      return collectionNamed(collectionName).find(selector).count();
    },

    // what a user has bought in the store, e.g. {castles: ['castle_03_skull']}
    setPurchases: function(userId, purchases) {
      refuseInProduction();
      return Meteor.users.update(userId, {$set: {purchases: purchases}});
    },

    // sets a player's resources and gold (the ones given)
    setResources: function(playerId, values) {
      refuseInProduction();
      return Players.update(playerId, {$set: _.pick(values, _s.market.types_plus_gold)});
    },

    // the free hex nearest to x,y that an army can stand on, at least
    // minDistance away, and of the type given (grain, ...) if one is
    freeHexNear: function(gameId, x, y, minDistance, type) {
      refuseInProduction();
      var taken = {};
      Castles.find({gameId: gameId}).forEach(function(c) { taken[c.x + '_' + c.y] = true; });
      Villages.find({gameId: gameId}).forEach(function(v) { taken[v.x + '_' + v.y] = true; });
      var best = null;
      Hexes.find(_.extend({gameId: gameId, hasBuilding: {$ne: true}}, type ? {type: type} : {}), {fields: {x: 1, y: 1}}).forEach(function(h) {
        var d = Hx.hexDistance(x, y, h.x, h.y);
        if (taken[h.x + '_' + h.y] || d < (minDistance || 1)) return;
        if (!best || d < best.distance) best = {x: h.x, y: h.y, distance: d};
      });
      if (!best) throw new Error('no free hex near ' + x + ',' + y);
      return best;
    },

    // an army for a player at x,y, made the way the game makes one
    makeArmy: function(playerId, soldiers, x, y) {
      refuseInProduction();
      var army = dTest.settle(dArmies.create(playerId, dTest.soldierCounts(soldiers), x, y));
      if (!army) throw new Error('could not make the army');
      return army._id;
    },

    // a finished level 1 village for a player at x,y, with no soldiers
    makeVillage: function(playerId, x, y) {
      refuseInProduction();
      var player = Players.findOne(playerId);
      var id = Villages.insert(_.extend({gameId: player.gameId, x: x, y: y, playerId: player._id, user_id: player.userId,
        username: player.username, name: 'E2E village', level: 1, under_construction: false, created_at: new Date(),
        income: dTest.settle(dVillages.resourcesFromSurroundingHexes(player.gameId, x, y, _s.villages.num_rings_village))},
        dTest.soldierCounts({})));
      dTest.settle(Mapmaker.buildingAdded(player.gameId, x, y));
      return id;
    },

    // makes vassalId the vassal of lordId, as winning a battle does
    makeVassal: function(lordId, vassalId) {
      refuseInProduction();
      dTest.settle(dInit.set_lord_and_vassal(lordId, vassalId));
      return Players.findOne(lordId, {fields: {allies_below: 1}}).allies_below;
    },

    // sends an army to x,y, through addArmyPath as its owner
    sendArmy: function(armyId, x, y) {
      refuseInProduction();
      var army = Armies.findOne(armyId);
      return dTest.settle(Meteor.server.method_handlers.addArmyPath.call({userId: army.user_id, isSimulation: false}, army.gameId, x, y, armyId));
    },

    // an army's paths, in order
    paths: function(armyId) {
      refuseInProduction();
      return Armypaths.find({armyId: armyId}, {sort: {index: 1}}).fetch();
    },

    // Makes the game's armies due to move on, so the worker moves them within
    // a few seconds instead of minutes.
    hurryArmies: function(gameId) {
      refuseInProduction();
      var past = moment().subtract(1, 'hour').toDate();
      return Armypaths.update({gameId: gameId}, {$set: {last_move_at: past}}, {multi: true});
    },

    // sets fields on an E2E game, e.g. {endDate: ...}
    setGame: function(gameId, fields) {
      refuseInProduction();
      if (!/^E2E /.test((Games.findOne(gameId, {fields: {name: 1}}) || {}).name)) throw new Error('not an E2E game: ' + gameId);
      return Games.update(gameId, {$set: fields});
    },

    // queues the jobs that draw an E2E game's minimap, as a new country does:
    // each country's border mask, which queues the game's minimap. The
    // worker runs them.
    queueMinimap: function(gameId) {
      refuseInProduction();
      if (!/^E2E /.test((Games.findOne(gameId, {fields: {name: 1}}) || {}).name)) throw new Error('not an E2E game: ' + gameId);
      Countries.find({gameId: gameId}, {fields: {_id: 1}}).forEach(function(country) {
        dTest.settle(Queues.addAsync('createCountryMask', {countryId: country._id}, {delay: 0, timeout: 1000 * 60}, country._id));
      });
      return Countries.find({gameId: gameId}).count();
    },

    // runs a cron's body now, e.g. '1 min job', so the worker takes the jobs
    // it adds within a few seconds instead of at the next tick
    runCron: function(name) {
      refuseInProduction();
      var entry = SyncedCron._entries[name];
      if (!entry) throw new Error('no cron named ' + name);
      dTest.settle(entry.job());
      return true;
    }
  };
}
