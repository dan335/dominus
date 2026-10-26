// Spectators can't change anything in a game (Oct 2026).
//
// Every method a client can call is run as three kinds of spectator against a
// seeded game, and the game has to come out unchanged. A method that isn't in
// server/methodPolicy.js, or isn't in the attack table below, fails here.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  _spectatorTests = async function(run, t) {
    var assert = t.assert;
    var equal = t.equal;


    // --- Helpers ---

    // a call from a client, goes through server/methodGate.js
    async function callAsClient(userId, method, args) {
      var inv = {userId: userId, isSimulation: false, connection: {id: 'spectatorTests', clientAddress: '127.0.0.1'},
        unblock: function() {}, setUserId: function() {}};
      return await DDP._CurrentInvocation.withValue(inv, async function() {
        return await Meteor.server.method_handlers[method].apply(inv, args);
      });
    }

    // a call from server code, skips the gate so the method's own checks are tested
    async function callAsServer(userId, method, args) {
      var inv = {userId: userId, isSimulation: false, connection: null, unblock: function() {}, setUserId: function() {}};
      return await DDP._CurrentInvocation.withValue(inv, async function() {
        return await Meteor.server.method_handlers[method].apply(inv, args);
      });
    }

    // returns the error thrown or the promise rejection, or null
    var throws = dTest.throws;

    // run a publication handler against a recording stub subscription
    async function runPublication(name, userId, args) {
      var out = {ready: 0, docs: {}, error: null};
      var stops = [];
      var sub = {
        userId: userId,
        connection: {id: 'spectatorTests'},
        ready: function() { out.ready++; },
        added: function(collection, id, fields) {
          out.docs[collection] = out.docs[collection] || {};
          out.docs[collection][id] = fields;
        },
        changed: function() {},
        removed: function(collection, id) {
          if (out.docs[collection]) delete out.docs[collection][id];
        },
        onStop: function(fn) { stops.push(fn); },
        error: function(e) { out.error = e; },
        stop: function() {}
      };
      try {
        var result = await Meteor.server.publish_handlers[name].apply(sub, args || []);
        var cursors = _.isArray(result) ? result : [result];
        for (const cursor of cursors) {
          if (cursor && typeof cursor._publishCursor === 'function') {
            await cursor._publishCursor(sub);
          }
        }
        if (cursors.length && cursors[0] && typeof cursors[0]._publishCursor === 'function') {
          // Meteor marks a sub ready itself after publishing returned cursors
          out.ready++;
        }
      } finally {
        stops.forEach(function(fn) { fn(); });
      }
      return out;
    }

    function publishedCount(out) {
      return _.reduce(out.docs, function(sum, docs) { return sum + _.keys(docs).length; }, 0);
    }

    // replace Queues.addAsync with a recorder so jobs are seen but never run
    function recordJobs() {
      var jobs = [];
      var original = Queues.addAsync;
      Queues.addAsync = async function(jobName, data) {
        jobs.push({name: jobName, data: data});
        return true;
      };
      return {jobs: jobs, restore: function() { Queues.addAsync = original; }};
    }

    // collections that hold game state, every doc has a gameId
    var gameCollections = {
      Players: Players, Castles: Castles, Villages: Villages, Armies: Armies, Armypaths: Armypaths,
      Capitals: Capitals, Hexes: Hexes, Countries: Countries, Rooms: Rooms, Roomchats: Roomchats,
      Recentchats: Recentchats, Alerts: Alerts, GlobalAlerts: GlobalAlerts, Markers: Markers,
      MarkerGroups: MarkerGroups, Market: Market, Markethistory: Markethistory, Battles2: Battles2,
      Reports: Reports, Gamesignups: Gamesignups, Dailystats: Dailystats, Gamestats: Gamestats
    };

    // everything about a game, one string per collection
    async function snapshot(gameId, userIds) {
      var parts = {};
      await dTest.eachAsync(gameCollections, async function(collection, name) {
        parts[name] = EJSON.stringify(await collection.find({gameId: gameId}, {sort: {_id: 1}}).fetchAsync(), {canonical: true});
      });
      parts.Games = EJSON.stringify(await Games.findOneAsync(gameId), {canonical: true});
      parts.users = EJSON.stringify(await Meteor.users.find({_id: {$in: userIds || []}}, {sort: {_id: 1}}).fetchAsync(), {canonical: true});
      return parts;
    }

    function changedParts(before, after) {
      return _.filter(_.keys(before), function(name) { return before[name] !== after[name]; });
    }


    // --- World: game G with a victim, and three kinds of spectator ---
    //   logged out (null userId), outsider (no player anywhere),
    //   attacker (a player in another game, G2, with their own castle and army)

    async function buildWorld() {
      var w = {};
      var started = {hasStarted: true, startAt: new Date(Date.now() - 1000 * 60 * 60)};
      w.G = (await t.createTestGame(_.extend({name: 'Spectated Game'}, started)))._id;
      w.G2 = (await t.createTestGame(_.extend({name: 'Attacker Game'}, started)))._id;

      w.victim = await t.createTestUser({username: 'victim_' + Random.id(4)});
      w.victim2 = await t.createTestUser({username: 'victim2_' + Random.id(4)});
      w.attacker = await t.createTestUser({username: 'attacker_' + Random.id(4)});
      w.outsider = await t.createTestUser({username: 'outsider_' + Random.id(4)});
      w.userIds = [w.victim._id, w.victim2._id, w.attacker._id, w.outsider._id];
      w.victimIds = [w.victim._id, w.victim2._id];

      var soldiers = {};
      _s.armies.types.forEach(function(type) { soldiers[type] = 10; });
      var resources = {};
      _s.market.types_plus_gold.forEach(function(type) { resources[type] = 1000; });

      async function player(gameId, user, extra) {
        return await Players.insertAsync(_.extend({
          gameId: gameId, userId: user._id, username: user.username, gameName: 'test',
          lord: null, king: null, is_king: true, is_dominus: false,
          allies_above: [], allies_below: [], team: [], vassals: [], num_allies_below: 0,
          x: 0, y: 0, castle_id: null, hex_scale: 1, pro: false, possibleDupe: true,
          hideAlertsMine: [], show_welcome_screen: true, lp_show_castle: true, sp_show_coords: true, sp_show_minimap: true,
          income: 0, losses_num: 0, male: true, gameIsOver: false, gameIsClosed: false
        }, resources, extra || {}));
      }

      w.P = await player(w.G, w.victim);
      w.P2 = await player(w.G, w.victim2, {lord: w.P, king: w.P, is_king: false, x: 2, y: 0});
      await Players.updateAsync(w.P, {$set: {allies_below: [w.P2], vassals: [w.P2], team: [w.P2], num_allies_below: 1}});
      await Players.updateAsync(w.P2, {$set: {allies_above: [w.P], team: [w.P]}});
      w.C = await player(w.G2, w.attacker);

      w.country = await Countries.insertAsync({gameId: w.G, minX: -10, maxX: 10, minY: -10, maxY: 10, minZ: -10, maxZ: 10, neighbors: [], paths: []});

      function owned(user, playerId, extra) {
        return _.extend({gameId: w.G, user_id: user._id, playerId: playerId, username: user.username, countryId: w.country, male: true}, soldiers, extra);
      }
      w.castle = await Castles.insertAsync(owned(w.victim, w.P, {x: 0, y: 0, name: 'victim castle', image: 'castle_01'}));
      await Players.updateAsync(w.P, {$set: {castle_id: w.castle}});
      w.castle2 = await Castles.insertAsync(owned(w.victim2, w.P2, {x: 2, y: 0, name: 'vassal castle', image: 'castle_01'}));
      await Players.updateAsync(w.P2, {$set: {castle_id: w.castle2}});
      w.village = await Villages.insertAsync(owned(w.victim, w.P, {x: 1, y: 0, name: 'victim village', level: 1, under_construction: false, income: {}}));
      w.army = await Armies.insertAsync(owned(w.victim, w.P, {x: 1, y: -1, name: 'victim army', last_move_at: new Date(), speed: 5, castle_x: 0, castle_y: 0, castle_id: w.castle}));
      w.path = await Armypaths.insertAsync({gameId: w.G, armyId: w.army, user_id: w.victim._id, x: 3, y: -1, index: 0, paused: false, createdAt: new Date(),
        countryIds: null, hexes: null, distance: null, time: null, speed: 5, last_move_at: new Date(), dirtyMoveTotals: false});
      w.capital = await Capitals.insertAsync({gameId: w.G, playerId: w.P, user_id: w.victim._id, countryId: w.country, x: 5, y: 5, name: 'victim capital', income: {}});
      await dTest.eachAsync([[0, 0], [1, 0], [1, -1], [2, 0], [3, -1], [5, 5]], async function(xy) {
        await Hexes.insertAsync({gameId: w.G, x: xy[0], y: xy[1], type: 'grain', large: false, hasBuilding: false});
      });

      w.everyoneRoom = await Rooms.insertAsync({gameId: w.G, name: 'Everyone', type: 'everyone', owner: null, admins: [], members: [w.P, w.P2], memberData: []});
      w.kingRoom = await Rooms.insertAsync({gameId: w.G, name: 'King', type: 'king', owner: w.P, admins: [], members: [w.P, w.P2], memberData: []});
      w.normalRoom = await Rooms.insertAsync({gameId: w.G, name: 'Private', type: 'normal', owner: w.P, admins: [], members: [w.P, w.P2], memberData: []});
      await Roomchats.insertAsync({gameId: w.G, room_id: w.normalRoom, playerId: w.P, user_id: w.victim._id, text: 'secret', created_at: new Date()});
      await Recentchats.insertAsync({gameId: w.G, room_id: w.normalRoom, updated_at: new Date()});

      w.alert = await Alerts.insertAsync({gameId: w.G, type: 'alert_receivedGoldFrom', playerIds: [{playerId: w.P, read: false}], created_at: new Date(), vars: {}});
      await GlobalAlerts.insertAsync({gameId: w.G, type: 'ga_test', created_at: new Date(), vars: {}});
      w.markerGroup = await MarkerGroups.insertAsync({gameId: w.G, user_id: w.victim._id, playerId: w.P, name: 'group', order: 0, createdAt: new Date(), updatedAt: new Date()});
      w.marker = await Markers.insertAsync({gameId: w.G, user_id: w.victim._id, playerId: w.P, groupId: w.markerGroup, order: 0, name: 'marker',
        description: '', unitType: 'castle', unitId: w.castle, x: 0, y: 0});
      await dTest.eachAsync(_s.market.types, async function(type) {
        await Market.insertAsync({gameId: w.G, type: type, price: 1, quantity: 100000, updated_at: new Date()});
      });

      // the attacker's own game
      w.cCastle = await Castles.insertAsync(_.extend({gameId: w.G2, user_id: w.attacker._id, playerId: w.C, username: w.attacker.username, x: 0, y: 0, name: 'attacker castle'}, soldiers));
      await Players.updateAsync(w.C, {$set: {castle_id: w.cCastle}});
      w.cArmy = await Armies.insertAsync(_.extend({gameId: w.G2, user_id: w.attacker._id, playerId: w.C, username: w.attacker.username, x: 0, y: 0, name: 'attacker army', last_move_at: new Date(), speed: 5}, soldiers));
      await dTest.eachAsync([[0, 0], [1, -1], [3, -1]], async function(xy) {
        await Hexes.insertAsync({gameId: w.G2, x: xy[0], y: xy[1], type: 'grain', large: false, hasBuilding: false});
      });
      await dTest.eachAsync(_s.market.types, async function(type) {
        await Market.insertAsync({gameId: w.G2, type: type, price: 1, quantity: 100000, updated_at: new Date()});
      });


      await waitForCounters(w);
      return w;
    }

    async function cleanupWorld(w) {
      await dTest.eachAsync([w.G, w.G2], async function(gameId) {
        await dTest.eachAsync(gameCollections, async function(collection) {
          await collection.removeAsync({gameId: gameId});
        });
        await Games.removeAsync(gameId);
      });
      await dTest.eachAsync(w.userIds, async function(userId) {
        await Markers.removeAsync({user_id: userId});
        await MarkerGroups.removeAsync({user_id: userId});
        await Gamesignups.removeAsync({userId: userId});
        await Meteor.users.removeAsync(userId);
      });
    }


    // --- Attack table: arguments for every method, aimed at game G ---
    // Each list is called as each kind of spectator. Methods that take a gameId
    // are also tried with the attacker's own game G2 and G's object ids.

    function attackTable(w) {
      var G = w.G;
      var soldiers = {};
      _s.armies.types.forEach(function(type) { soldiers[type] = 1; });

      // the spectated game, and the attacker's own game with G's objects
      var games = function(fn) { return [fn(G), fn(w.G2)]; };
      var rooms = function(fn) {
        return _.flatten([w.everyoneRoom, w.kingRoom, w.normalRoom].map(function(room) {
          return games(function(g) { return fn(g, room); });
        }), true);
      };
      var gameOnly = games(function(g) { return [g]; });

      return {
        // public
        coords_to_id: [[G, 0, 0, 'hex']],
        getResourcesGatheredAtHex: [[G, 1, 0]],
        getGameInfo: [[G], [{$ne: null}]],
        fetchCountriesOnScreen: [[[w.country]], [[{$ne: null}]]],
        addPostView: [['noSuchTopic']],
        forumMarkAllRead: [[]],
        reportClientError: [[{kind: 'error', message: 'spectator test'}]],

        // armies
        hireArmy: games(function(g) { return [g, soldiers, w.castle, 'castle']; })
          .concat(games(function(g) { return [g, soldiers, w.village, 'village']; })),
        disbandArmy: games(function(g) { return [g, w.army]; }),
        splitArmy: games(function(g) { return [g, w.army, soldiers]; }),
        createArmyFromBuilding: games(function(g) { return [g, 'castle', w.castle, soldiers]; })
          .concat(games(function(g) { return [g, 'village', w.village, soldiers]; }))
          .concat([[G, 'castle', w.cCastle, soldiers]]),
        'armies.combineArmies': games(function(g) { return [{gameId: g, armyId: w.army}]; }),
        'armies.joinBuilding': [[{armyId: w.army}]],
        'armies.returnToCastle': [[{armyId: w.army}]],
        'armies.stopMoving': [[{armyId: w.army}]],

        // army paths
        addArmyPath: games(function(g) { return [g, 3, -1, w.army]; }),
        removeArmyPath: [[w.path]],
        decreasePathIndex: [[w.path]],
        increasePathIndex: [[w.path]],
        pauseMovement: [[w.army]],
        resumeMovement: [[w.army]],

        // castles, villages, market
        send_gold_to: games(function(g) { return [g, w.P2, 10]; }),
        set_unit_image: games(function(g) { return [w.castle, 'castles', 'castle_02_keep', g]; }),
        buildVillage: games(function(g) { return [g, 1, -1]; }),
        upgradeVillage: games(function(g) { return [g, w.village]; }),
        destroyVillage: [[w.village]],
        buy_resource: games(function(g) { return [g, 'grain', 1]; }),
        sell_resource: games(function(g) { return [g, 'grain', 1]; }),

        // names and player settings
        edit_name: [['castle', w.castle, 'hacked', w.P], ['castle', w.castle, 'hacked', w.C], ['village', w.village, 'hacked', w.P],
          ['army', w.army, 'hacked', w.P], ['capital', w.capital, 'hacked', w.P]],
        change_username: [[w.P, 'hacked']],
        reportPlayer: [[w.P, 'hacked']],
        setHexScale: [[w.P, 0.5]],
        activateProToken: gameOnly,
        deleteGameAccount: gameOnly,
        hide_welcome_screen: gameOnly,
        show_castle: gameOnly,
        hide_castle: gameOnly,
        show_villages: gameOnly,
        hide_villages: gameOnly,
        show_armies: gameOnly,
        hide_armies: gameOnly,
        show_lords: gameOnly,
        hide_lords: gameOnly,
        show_allies: gameOnly,
        hide_allies: gameOnly,
        show_coords: [[w.P]],
        hide_coords: [[w.P]],
        show_minimap: [[w.P]],
        hide_minimap: [[w.P]],

        // alerts
        hideAlertMine: [[w.P, 'alert_receivedGoldFrom']],
        showAlertMine: [[w.P, 'alert_receivedGoldFrom']],
        markAlertAsRead: games(function(g) { return [g, w.alert]; }),
        markAllAlertsAsRead: [[w.P]],

        // markers
        addMarker: games(function(g) { return [g, 'castle', w.castle]; }),
        addMarkerCoords: games(function(g) { return [g, 'hex', 0, 0]; }),
        addMarkerGroup: games(function(g) { return [g, 'hacked']; }),
        setMarkerOrder: [[w.marker, w.markerGroup, w.markerGroup, 0, 1]],
        saveMarkerInfo: [[w.marker, 'hacked', 'hacked']],
        saveMarkerGroupInfo: [[w.markerGroup, 'hacked']],
        moveMarkerGroupUp: [[w.markerGroup]],
        moveMarkerGroupDown: [[w.markerGroup]],
        fixMarkerGroupOrder: [[]],
        removeMarkerGroup: [[w.markerGroup]],
        removeMarker: [[w.marker]],

        // chat
        addChatToRoom: rooms(function(g, room) { return [g, room, 'hacked']; }),
        startChatroomWith: games(function(g) { return [g, w.victim.username]; }),
        leaveChatroom: rooms(function(g, room) { return [g, room]; }),
        renameChatroom: rooms(function(g, room) { return [g, room, 'hacked']; }),
        inviteToChatroom: rooms(function(g, room) { return [g, room, w.attacker.username]; }),
        chatroomMakeOwner: rooms(function(g, room) { return [g, room, w.P2]; }),
        chatroomMakeAdmin: rooms(function(g, room) { return [g, room, w.P2]; }),
        chatroomRemoveAdmin: rooms(function(g, room) { return [g, room, w.P2]; }),
        kickFromChatroom: rooms(function(g, room) { return [g, room, w.P2]; }),

        // joining: queuing your own createPlayer is the one allowed effect
        joinGame: [[G, 'spectator']],
        signupForGame: [[w.victim._id, G, 'spectator']],
        cancelSignupForGame: [[w.victim._id, G], [{$ne: null}, G]],

        // account
        changeMainUsername: [['spectator_' + Random.id(4)]],
        setGender: [[false]],
        deleteAvatar: [[]],
        uploadAvatarToS3: [[null, 'not/an-image', 0]],
        rensendEmailVerification: [[]],
        onEmailVerified: [[]],
        stripeProCheckout: [[]],
        stripeDonationCheckout: [[]],
        stripePurchaseCheckout: [[]],
        daysSincePlayerActive: [[w.victim._id]],
        deleteEntireAccount: [[]],

        // admin and moderator
        banUser: [[w.victim._id, 'hacked']],
        unbanUser: [[w.victim._id]],
        addOrEditGame: [[]],
        removeGame: [[G]],
        resetQueueStats: [[]],
        sendToMailingList: [['noSuchTemplate']],
        addMod: [[w.attacker._id]],
        pauseJobQueue: [[]],
        resumeJobQueue: [[]],
        clearUniqueIdsForJob: [['runBattle']],
        runBullJob: [['runBattle', {gameId: G, x: 0, y: 0}]],
        runAllTests: [[]],
        runGameCreationTests: [[]],

        // forum
        forumPinTopic: [['noSuchTopic']],
        forumUnpinTopic: [['noSuchTopic']],
        forumDeleteTopic: [['noSuchTopic']],
        forumLockTopic: [['noSuchTopic']],
        forumUnlockTopic: [['noSuchTopic']],
        forumNewTopic: [[]],
        forumNewPost: [['noSuchTopic', '']]
      };
    }

    // The worker keeps Games.numPlayers, numVillages and numCountries up to date
    // with a 1s debounce (dominus-game/server/num*.js), so building the world
    // changes the Games docs a second later. Wait until they stop changing, or
    // that write gets blamed on whichever method is being called at the time.
    async function waitForCounters(w) {
      var read = async function() { return EJSON.stringify(await Games.find({_id: {$in: [w.G, w.G2]}}, {sort: {_id: 1}}).fetchAsync()); };
      var last = await read();
      var stableSince = Date.now();
      var deadline = Date.now() + 10000;
      while (Date.now() - stableSince < 1500 && Date.now() < deadline) {
        await dTest.sleep(250);
        var now = await read();
        if (now !== last) {
          last = now;
          stableSince = Date.now();
        }
      }
    }

    // ids that would show up in a job about game G
    async function gameIds(w) {
      var ids = [w.G];
      await dTest.eachAsync(gameCollections, async function(collection) {
        await collection.find({gameId: w.G}, {fields: {_id: 1}}).forEachAsync(function(doc) { ids.push(doc._id); });
      });
      return ids;
    }

    function clientMethodNames() {
      return _.reject(_.keys(Meteor.server.method_handlers), dGate.isCoreMethod);
    }


    // --- Coverage ---

    await run('spectator: every client callable method is in server/methodPolicy.js and wrapped by the gate', function() {
      var names = clientMethodNames();
      assert(names.length > 100, 'found the app methods (' + names.length + ')');
      equal(_.reject(names, function(n) { return MethodPolicy[n]; }).join(','), '', 'methods missing from server/methodPolicy.js');
      equal(_.reject(names, function(n) { return Meteor.server.method_handlers[n]._gated; }).join(','), '', 'methods not wrapped by server/methodGate.js');
      equal(_.reject(_.keys(MethodPolicy), function(n) { return Meteor.server.method_handlers[n]; }).join(','), '', 'policy entries for methods that no longer exist');
      var malformed = _.filter(_.keys(MethodPolicy), function(n) {
        var policy = MethodPolicy[n];
        if (policy.access == 'game') {
          return typeof policy.game !== 'function';
        }
        return policy.access != 'public' && policy.access != 'user';
      });
      equal(malformed.join(','), '', 'policy entries without a valid access level');
    });

    await run('spectator: every client callable method is in the attack table', function() {
      var w = {G: 'g', G2: 'g2', victim: {_id: 'v', username: 'v'}, attacker: {_id: 'a', username: 'a'}};
      var table = attackTable(w);
      equal(_.reject(clientMethodNames(), function(n) { return table[n]; }).join(','), '', 'methods missing from the attack table in server/spectatorTests.js');
    });

    await run('spectator: a method missing from the policy refuses client calls', async function() {
      var name = 'spectatorTestsUnlisted_' + Random.id(4);
      Meteor.server.method_handlers[name] = function() { return 'ran'; };
      try {
        dGate.wrapAll();
        var user = await t.createTestUser();
        var e = await throws(async function() { await callAsClient(user._id, name, []); });
        assert(e && e.error === 'not-authorized', 'client call refused');
        equal(await callAsServer(null, name, []), 'ran', 'server code can still call it');
        await t.cleanupUser(user._id);
      } finally {
        delete Meteor.server.method_handlers[name];
      }
    });


    // --- The guarantee ---

    await run('spectator: no method lets a logged out, outside or other-game caller change the game', async function() {
      var w = await buildWorld();
      var recorder = recordJobs();
      try {
        var table = attackTable(w);
        var ids = await gameIds(w);
        var attackers = [
          {label: 'logged out', userId: null},
          {label: 'not a player', userId: w.outsider._id},
          {label: 'player in another game', userId: w.attacker._id, ownGame: w.G2}
        ];

        // deleting your own account goes last so the attackers stay around
        var names = _.sortBy(clientMethodNames(), function(n) { return n == 'deleteEntireAccount' ? 1 : 0; });

        var problems = [];
        var calls = 0;
        var before = await snapshot(w.G, w.victimIds);
        var before2 = await snapshot(w.G2, []);

        await dTest.eachAsync(names, async function(name) {
          await dTest.eachAsync(table[name] || [], async function(args) {
            await dTest.eachAsync(attackers, async function(attacker) {
              recorder.jobs.length = 0;
              await throws(async function() { await callAsClient(attacker.userId, name, EJSON.clone(args)); });
              calls++;

              let label = name + '(' + EJSON.stringify(args) + ') as ' + attacker.label;

              let after = await snapshot(w.G, w.victimIds);
              let changed = changedParts(before, after);
              if (changed.length) {
                problems.push(label + ' changed ' + changed.join(', '));
              }
              before = after;

              // the attacker may change their own game, nobody else may
              let after2 = await snapshot(w.G2, []);
              if (!attacker.ownGame) {
                let changed2 = changedParts(before2, after2);
                if (changed2.length) {
                  problems.push(label + ' changed the other game: ' + changed2.join(', '));
                }
              }
              before2 = after2;

              recorder.jobs.forEach(function(job) {
                if (job.name == 'createPlayer' && job.data && job.data.userId === attacker.userId && attacker.userId) {
                  return;
                }
                let data = JSON.stringify(job.data || {});
                if (_.some(ids, function(id) { return data.indexOf(id) !== -1; })) {
                  problems.push(label + ' queued ' + job.name + ' for the game');
                }
              });
            });
          });
        });

        assert(calls > 400, 'made the calls (' + calls + ')');
        equal(problems.join(' | '), '', 'nothing in the game changed');
      } finally {
        recorder.restore();
        await cleanupWorld(w);
      }
    });

    await run('spectator: collection mutators refuse client writes to game collections', async function() {
      var w = await buildWorld();
      try {
        var before = await snapshot(w.G, w.victimIds);
        var targets = {players: w.P, castles: w.castle, villages: w.village, armies: w.army, armypaths2: w.path,
          capitals: w.capital, rooms: w.normalRoom, alerts: w.alert, markers: w.marker, market: (await Market.findOneAsync({gameId: w.G}))._id};
        await dTest.eachAsync(targets, async function(id, collection) {
          await dTest.eachAsync([null, w.outsider._id, w.victim._id], async function(userId) {
            await throws(async function() { await callAsClient(userId, '/' + collection + '/update', [{_id: id}, {$set: {hacked: true}}, {}]); });
            await throws(async function() { await callAsClient(userId, '/' + collection + '/remove', [{_id: id}]); });
            await throws(async function() { await callAsClient(userId, '/' + collection + '/insert', [{gameId: w.G, hacked: true}]); });
          });
        });
        equal(changedParts(before, await snapshot(w.G, w.victimIds)).join(', '), '', 'nothing changed');
      } finally {
        await cleanupWorld(w);
      }
    });

    await run('spectator: publications never change the game, and private ones stay empty when logged out', async function() {
      var w = await buildWorld();
      try {
        var before = await snapshot(w.G, w.victimIds);

        var pub = async function(name, userId, args) {
          return await runPublication(name, userId, args);
        };

        // public game data reaches logged out spectators
        await dTest.eachAsync([['game', [w.G]], ['countryIndex', [w.G]], ['countryOnScreen', [w.country]], ['castleForHexInfo', [w.castle]],
          ['armyForHexInfo', [w.army]], ['villageForHexInfo', [w.village]], ['capitalForHexInfo', [w.capital]],
          ['gamePiecesAtHex', [w.G, 0, 0]], ['rightPanelPlayers', [w.P]], ['rightPanelTree', [w.P2]],
          ['market', [w.G]], ['globalAlerts', [w.G, 10]]], async function(c) {
          let out = await pub(c[0], null, c[1]);
          assert(publishedCount(out) > 0, c[0] + ' publishes to a logged out spectator');
        });

        let players = (await pub('rightPanelPlayers', null, [w.P])).docs.right_panel_players;
        assert(players && players[w.P] && !_.has(players[w.P], 'possibleDupe'), 'rightPanelPlayers leaves out possibleDupe');

        // object selectors are refused (server/argumentCheckTests.js)
        await dTest.eachAsync([['countryIndex', [{$ne: null}]], ['castleForHexInfo', [{$ne: null}]], ['rightPanelPlayers', [{$ne: null}]],
          ['game', [{$ne: null}]], ['market', [{$ne: null}]]], async function(c) {
          var refused = null;
          try {
            await pub(c[0], null, c[1]);
          } catch (e) {
            refused = e;
          }
          assert(refused, c[0] + ' refuses an object selector');
        });

        // a spectator's private data is empty, and nothing private about the victim
        await dTest.eachAsync([null, w.outsider._id], async function(userId) {
          await dTest.eachAsync([['player', [w.G]], ['myArmies', [w.G]], ['myArmyPaths', [w.G]], ['left_panel_castle', [w.G]],
            ['left_panel_villages', [w.G]], ['my_dailystats', [w.G]], ['myMarkers', [w.P]], ['myMarkerGroups', [w.P]]], async function(c) {
            equal(publishedCount(await pub(c[0], userId, c[1])), 0, c[0] + ' publishes nothing to ' + userId);
          });
        });
        await dTest.eachAsync([['everyoneChatroom', [w.G]], ['roomchats', [w.normalRoom]], ['myAlerts', [w.P, 10, []]]], async function(c) {
          equal(publishedCount(await pub(c[0], null, c[1])), 0, c[0] + ' publishes nothing when logged out');
        });

        equal(changedParts(before, await snapshot(w.G, w.victimIds)).join(', '), '', 'running publications changed nothing');
      } finally {
        await cleanupWorld(w);
      }
    });


    // --- The players can still play ---

    await run('spectator: the gate still lets a player act in their own game', async function() {
      var w = await buildWorld();
      var recorder = recordJobs();
      try {
        var uid = w.victim._id;

        var pathId = await callAsClient(uid, 'addArmyPath', [w.G, 2, 0, w.army]);
        assert(await Armypaths.findOneAsync({_id: pathId, user_id: uid, armyId: w.army}), 'owner can add a path');
        await callAsClient(uid, 'removeArmyPath', [pathId]);
        assert(!await Armypaths.findOneAsync(pathId), 'owner can remove a path');

        await callAsClient(uid, 'setHexScale', [w.P, 0.5]);
        equal((await Players.findOneAsync(w.P)).hex_scale, 0.5, 'owner can set zoom');
        await callAsClient(uid, 'setHexScale', [w.P, 50]);
        equal((await Players.findOneAsync(w.P)).hex_scale, _s.init.hexScaleMax, 'zoom is clamped');

        var chats = await Roomchats.find({room_id: w.normalRoom}).countAsync();
        await callAsClient(uid, 'addChatToRoom', [w.G, w.normalRoom, 'hello']);
        equal(await Roomchats.find({room_id: w.normalRoom}).countAsync(), chats + 1, 'member can chat');

        await callAsClient(uid, 'edit_name', ['castle', w.castle, 'New Name', w.P]);
        equal((await Castles.findOneAsync(w.castle)).name, 'New Name', 'owner can rename a castle');

        // the castle panel sends the gameId as the 4th argument
        await Meteor.users.updateAsync(uid, {$set: {purchases: {castles: ['castle_01', 'castle_02_keep']}}});
        await callAsClient(uid, 'set_unit_image', [w.castle, 'castles', 'castle_02_keep', w.G]);
        equal((await Castles.findOneAsync(w.castle)).image, 'castle_02_keep', 'owner can change their castle image');
        var imageError = await throws(async function() { await callAsClient(uid, 'set_unit_image', [w.castle, 'castles', 'castle_01', w.P]); });
        assert(imageError && imageError.error === 'not-authorized', 'a playerId in the gameId slot is refused');
        equal((await Castles.findOneAsync(w.castle)).image, 'castle_02_keep', 'image unchanged after the refused call');

        await callAsClient(uid, 'markAlertAsRead', [w.G, w.alert]);
        assert((await Alerts.findOneAsync(w.alert)).playerIds[0].read, 'player can mark their alert read');

        await callAsClient(uid, 'hide_castle', [w.G]);
        equal((await Players.findOneAsync(w.P)).lp_show_castle, false, 'player can change panel settings');

        await callAsClient(uid, 'chatroomMakeAdmin', [w.G, w.normalRoom, w.P2]);
        assert(_.contains((await Rooms.findOneAsync(w.normalRoom)).admins, w.P2), 'room owner can make an admin');

        await callAsClient(uid, 'armies.stopMoving', [{armyId: w.army}]);
        equal(await Armypaths.find({armyId: w.army}).countAsync(), 0, 'owner can stop their army');

        // a gameId that doesn't match the object is refused even for the owner
        var e = await throws(async function() { await callAsClient(uid, 'disbandArmy', [w.G2, w.army]); });
        assert(e && e.error === 'not-authorized', 'object from another game is refused');
        assert(await Armies.findOneAsync(w.army), 'army still there');
      } finally {
        recorder.restore();
        await cleanupWorld(w);
      }
    });


    // --- The method fixes on their own, without the gate ---

    await run('spectator: addArmyPath only adds paths to your own army in that game', async function() {
      var w = await buildWorld();
      try {
        await Armypaths.removeAsync({armyId: w.army});
        await dTest.eachAsync([[w.attacker._id, w.G2], [w.attacker._id, w.G], [w.outsider._id, w.G], [null, w.G], [w.victim._id, w.G2]], async function(c) {
          var e = await throws(async function() { await callAsServer(c[0], 'addArmyPath', [c[1], 3, -1, w.army]); });
          assert(e, 'refused for ' + c[0] + ' in ' + c[1]);
        });
        equal(await Armypaths.find({armyId: w.army}).countAsync(), 0, 'no path was added');

        var pathId = await callAsServer(w.victim._id, 'addArmyPath', [w.G, 3, -1, w.army]);
        var path = await Armypaths.findOneAsync(pathId);
        assert(path && path.user_id === w.victim._id && path.speed === 5, 'owner path added with the army speed');
      } finally {
        await cleanupWorld(w);
      }
    });

    await run('spectator: setHexScale only changes your own player', async function() {
      var w = await buildWorld();
      try {
        await callAsServer(w.outsider._id, 'setHexScale', [w.P, 0.5]);
        await throws(async function() { await callAsServer(null, 'setHexScale', [w.P, 0.5]); });
        equal((await Players.findOneAsync(w.P)).hex_scale, 1, 'victim zoom unchanged');
      } finally {
        await cleanupWorld(w);
      }
    });

    await run('spectator: addChatToRoom needs the room to be in your game and you in the room', async function() {
      var w = await buildWorld();
      try {
        var count = async function() { return await Roomchats.find({room_id: {$in: [w.everyoneRoom, w.kingRoom, w.normalRoom]}}).countAsync(); };
        var start = await count();

        // the attacker is a player in G2 but the rooms are in G
        await dTest.eachAsync([w.everyoneRoom, w.kingRoom, w.normalRoom], async function(room) {
          var e = await throws(async function() { await callAsServer(w.attacker._id, 'addChatToRoom', [w.G2, room, 'hi']); });
          assert(e && e.error === 'not-authorized', 'other game player refused in ' + room);
          equal(await callAsServer(w.outsider._id, 'addChatToRoom', [w.G, room, 'hi']), false, 'non player refused');
        });

        // a player who isn't a member of a private room
        var other = await Rooms.insertAsync({gameId: w.G, name: 'Other', type: 'normal', owner: w.P, admins: [], members: [w.P], memberData: []});
        var e = await throws(async function() { await callAsServer(w.victim2._id, 'addChatToRoom', [w.G, other, 'hi']); });
        assert(e && e.error === 'not-authorized', 'non member refused');
        var missing = await throws(async function() { await callAsServer(w.victim._id, 'addChatToRoom', [w.G, 'noSuchRoom', 'hi']); });
        assert(missing && missing.error === 'not-authorized', 'missing room refused');
        equal(await count(), start, 'nothing posted');

        // every player can post in the everyone room, even before the job adds them to members
        await Rooms.updateAsync(w.everyoneRoom, {$set: {members: []}});
        await callAsServer(w.victim2._id, 'addChatToRoom', [w.G, w.everyoneRoom, 'hi everyone']);
        equal(await Roomchats.find({room_id: w.everyoneRoom}).countAsync(), 1, 'player posted in the everyone room');
        await callAsServer(w.victim._id, 'addChatToRoom', [w.G, w.normalRoom, 'hi']);
        equal(await Roomchats.find({room_id: w.normalRoom}).countAsync(), 2, 'member posted');
      } finally {
        await cleanupWorld(w);
      }
    });

    await run('spectator: cancelSignupForGame only cancels your own signup', async function() {
      var game = await t.createTestGame({startAt: new Date(Date.now() + 1000 * 60 * 60 * 24)});
      var victim = await t.createTestUser();
      var attacker = await t.createTestUser();
      try {
        await Gamesignups.insertAsync({gameId: game._id, userId: victim._id, username: victim.username, createdAt: new Date(), usedToken: false});
        await Gamesignups.insertAsync({gameId: game._id, userId: attacker._id, username: attacker.username, createdAt: new Date(), usedToken: false});
        var refused = null;
        try {
          await callAsServer(attacker._id, 'cancelSignupForGame', [{$ne: null}, game._id]);
        } catch (e) {
          refused = e;
        }
        assert(refused, 'an object for the user id is refused');
        equal(await Gamesignups.find({gameId: game._id}).countAsync(), 2, 'and cancels nothing');

        // the userId argument is ignored
        await callAsServer(attacker._id, 'cancelSignupForGame', [victim._id, game._id]);
        equal(await Gamesignups.find({gameId: game._id, userId: victim._id}).countAsync(), 1, 'victim signup kept');
        equal(await Gamesignups.find({gameId: game._id, userId: attacker._id}).countAsync(), 0, 'own signup cancelled');
      } finally {
        await Gamesignups.removeAsync({gameId: game._id});
        await t.cleanup(game._id);
        await t.cleanupUser(victim._id);
        await t.cleanupUser(attacker._id);
      }
    });

    await run('spectator: createArmyFromBuilding only uses buildings in the game you name', async function() {
      var w = await buildWorld();
      var recorder = recordJobs();
      try {
        var footmen = async function(id) { return (await Castles.findOneAsync(id)).footmen; };
        var soldiers = {};
        _s.armies.types.forEach(function(type) { soldiers[type] = 0; });
        soldiers.footmen = 1;

        // the attacker's own castle is in G2, they have no player in G
        var e = await throws(async function() { await callAsServer(w.attacker._id, 'createArmyFromBuilding', [w.G, 'castle', w.cCastle, soldiers]); });
        assert(e, 'refused');
        equal(await footmen(w.cCastle), 10, 'soldiers not taken out of the castle');

        // the victim's castle is in G, asking for G2 finds nothing
        e = await throws(async function() { await callAsServer(w.victim._id, 'createArmyFromBuilding', [w.G2, 'castle', w.castle, soldiers]); });
        assert(e, 'refused');
        equal(await footmen(w.castle), 10, 'soldiers not taken out of the castle');
        equal(await Armies.find({gameId: w.G2, user_id: w.victim._id}).countAsync(), 0, 'no army created');
      } finally {
        recorder.restore();
        await cleanupWorld(w);
      }
    });

    await run('spectator: removeForeignArmyPaths removes paths added to someone else\'s army', async function() {
      var w = await buildWorld();
      try {
        var foreign = await Armypaths.insertAsync({gameId: w.G, armyId: w.army, user_id: w.attacker._id, x: 3, y: -1, index: 1});
        var anonymous = await Armypaths.insertAsync({gameId: w.G, armyId: w.army, user_id: null, x: 3, y: -1, index: 2});
        var wrongGame = await Armypaths.insertAsync({gameId: w.G2, armyId: w.army, user_id: w.victim._id, x: 3, y: -1, index: 3});
        t.assert(await removeForeignArmyPaths() >= 3, 'it counts the paths it removed');
        assert(!await Armypaths.findOneAsync(foreign), 'path from another user removed');
        assert(!await Armypaths.findOneAsync(anonymous), 'path from a logged out caller removed');
        assert(!await Armypaths.findOneAsync(wrongGame), 'path in the wrong game removed');
        assert(await Armypaths.findOneAsync(w.path), 'owner path kept');
        t.equal(await removeForeignArmyPaths(), 0, 'and does nothing once clean');
      } finally {
        await cleanupWorld(w);
      }
    });


    // --- Rate limits ---

    await run('spectator: logged out spectators are rate limited per connection, not all together', function() {
      var input = function(connectionId) {
        return {userId: null, clientAddress: '10.20.30.40', type: 'subscription', name: 'game', connectionId: connectionId};
      };
      var a = 'spectatorTestsA_' + Random.id();
      var b = 'spectatorTestsB_' + Random.id();
      for (var i = 0; i < 6; i++) {
        DDPRateLimiter._increment(input(a));
      }
      assert(!DDPRateLimiter._check(input(a)).allowed, 'busy connection is limited');
      DDPRateLimiter._increment(input(b));
      assert(DDPRateLimiter._check(input(b)).allowed, 'another logged out connection is not');
    });
  };
}
