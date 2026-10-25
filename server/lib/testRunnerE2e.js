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
      dChat.setupEveryoneChatroom(w.gameId);
      var out = {gameId: w.gameId, players: {}};
      names.forEach(function(name, i) {
        var castle = w.castle(i);
        out.players[name] = {userId: users[i]._id, username: users[i].username, playerId: w.players[i]._id,
          castle: {_id: castle._id, x: castle.x, y: castle.y, name: castle.name}};
      });
      return out;
    },

    // a document, for checking what a click did. collectionName is the name
    // in the code (Armypaths) or in Mongo (armypaths2).
    findOne: function(collectionName, selector) {
      refuseInProduction();
      var byName = {Players: Players, Castles: Castles, Villages: Villages, Armies: Armies, Armypaths: Armypaths,
        Capitals: Capitals, Market: Market, Battles2: Battles2, Roomchats: Roomchats, Rooms: Rooms, Alerts: Alerts,
        Games: Games, Settings: Settings, Forumtopics: Forumtopics, Forumposts: Forumposts, users: Meteor.users,
        Markers: Markers, MarkerGroups: MarkerGroups};
      var collection = byName[collectionName] || _.find(dTest.gameCollections(), function(c) { return c._name == collectionName; });
      if (!collection) throw new Error('no collection ' + collectionName);
      return collection.findOne(selector);
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
    // minDistance away
    freeHexNear: function(gameId, x, y, minDistance) {
      refuseInProduction();
      var taken = {};
      Castles.find({gameId: gameId}).forEach(function(c) { taken[c.x + '_' + c.y] = true; });
      Villages.find({gameId: gameId}).forEach(function(v) { taken[v.x + '_' + v.y] = true; });
      var best = null;
      Hexes.find({gameId: gameId, hasBuilding: {$ne: true}}, {fields: {x: 1, y: 1}}).forEach(function(h) {
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
      var army = dArmies.create(playerId, dTest.soldierCounts(soldiers), x, y);
      if (!army) throw new Error('could not make the army');
      return army._id;
    },

    // a finished level 1 village for a player at x,y, with no soldiers
    makeVillage: function(playerId, x, y) {
      refuseInProduction();
      var player = Players.findOne(playerId);
      var id = Villages.insert(_.extend({gameId: player.gameId, x: x, y: y, playerId: player._id, user_id: player.userId,
        username: player.username, name: 'E2E village', level: 1, under_construction: false, created_at: new Date(),
        income: dVillages.resourcesFromSurroundingHexes(player.gameId, x, y, _s.villages.num_rings_village)},
        dTest.soldierCounts({})));
      Mapmaker.buildingAdded(player.gameId, x, y);
      return id;
    },

    // sends an army to x,y, through addArmyPath as its owner
    sendArmy: function(armyId, x, y) {
      refuseInProduction();
      var army = Armies.findOne(armyId);
      return Meteor.server.method_handlers.addArmyPath.call({userId: army.user_id, isSimulation: false}, army.gameId, x, y, armyId);
    },

    // Makes the game's armies due to move on, so the worker moves them within
    // a few seconds instead of minutes.
    hurryArmies: function(gameId) {
      refuseInProduction();
      var past = moment().subtract(1, 'hour').toDate();
      return Armypaths.update({gameId: gameId}, {$set: {last_move_at: past}}, {multi: true});
    }
  };
}
