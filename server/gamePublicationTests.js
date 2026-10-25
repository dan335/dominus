// Publication contracts: what each in-game publication sends (Oct 2026).
//
// Each publication is subscribed to over a real DDP connection
// (server/lib/testRunnerDdp.js), as a player of a real started game or as a
// logged out spectator, and the test checks exactly which documents arrive
// and which fields they have, against the database. Field lists are written
// out here on purpose: they are the contract the browser relies on, and the
// Meteor upgrade changes how projections are passed.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    dTest.addSuite('publication contracts: in game (server/gamePublicationTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;

      var w = dTest.buildGameWorld({players: 3});
      var G = w.gameId;
      var pid = function(i) { return w.players[i]._id; };
      var uid = function(i) { return w.users[i]._id; };
      var soldiers = _s.armies.types;
      var f = {};   // fixture ids


      // --- Fixtures: one of everything a publication can send ---

      var castle0 = w.castle(0);
      var countryId = castle0.countryId;
      Players.update(pid(0), {$set: {allies_below: [pid(1)], vassals: [pid(1)], num_allies_below: 1, income: 50, losses_worth: 3, losses_num: 2}});
      Players.update(pid(1), {$set: {allies_above: [pid(0)], lord: pid(0), king: pid(0), is_king: false, income: 20}});
      Players.update(pid(2), {$set: {is_dominus: true, income: 10}});

      f.army0 = w.makeArmy(0, {footmen: 2, archers: 1})._id;
      var away = w.freeHex();
      f.army1 = w.makeArmy(1, {cavalry: 4}, away)._id;
      f.path0 = Armypaths.insert({gameId: G, x: away.x, y: away.y, index: 0, armyId: f.army0, user_id: uid(0),
        createdAt: new Date(), paused: true, hexes: null, countryIds: null, distance: null, time: null, speed: null});

      var vHex = w.freeHex([away]);
      f.village0 = Villages.insert(_.extend({gameId: G, x: vHex.x, y: vHex.y, countryId: countryId, playerId: pid(0), user_id: uid(0),
        username: w.players[0].username, name: 'Testville', level: 2, under_construction: false, constructionStarted: new Date(),
        created_at: new Date(), lastIncomeUpdate: new Date(), castle_id: castle0._id, castle_x: castle0.x, castle_y: castle0.y,
        income: {worth: 7, grain: 3, gold: 1}, male: true}, dTest.soldierCounts({pikemen: 3})));
      var cHex = w.freeHex([away, vHex]);
      f.capital = Capitals.insert(_.extend({gameId: G, x: cHex.x, y: cHex.y, countryId: countryId, playerId: pid(0), user_id: uid(0),
        name: 'Test Capital', income: {worth: 9, ore: 4}, lastIncomeUpdate: new Date(), male: true}, dTest.soldierCounts({footmen: 6})));

      f.gAlertNew = GlobalAlerts.insert({gameId: G, created_at: new Date(), type: 'ga_sentGold', vars: {amount: 1}});
      f.gAlertOld = GlobalAlerts.insert({gameId: G, created_at: new Date(Date.now() - 60000), type: 'ga_nameChange', vars: {}});
      f.alertUnread = Alerts.insert({gameId: G, created_at: new Date(), type: 'alert_receivedArmy', vars: {},
        playerIds: [{playerId: pid(0), read: false}, {playerId: pid(1), read: false}]});
      f.alertRead = Alerts.insert({gameId: G, created_at: new Date(Date.now() - 1000), type: 'alert_battleStart', vars: {},
        playerIds: [{playerId: pid(0), read: true}]});
      f.alertHidden = Alerts.insert({gameId: G, created_at: new Date(Date.now() - 2000), type: 'alert_villageDestroyed', vars: {},
        playerIds: [{playerId: pid(0), read: false}]});

      f.battleOn = Battles2.insert({gameId: G, x: away.x, y: away.y, isOver: false, createdAt: new Date(), updatedAt: new Date(),
        titleInfo: {title: 'on'}, showBattle: true, secret: 'not in titles'});
      f.battleOver = Battles2.insert({gameId: G, x: away.x, y: away.y, isOver: true, createdAt: new Date(Date.now() - 60000),
        updatedAt: new Date(Date.now() - 60000), titleInfo: {title: 'over'}, showBattle: true});
      f.round1 = Rounds.insert({battle_id: f.battleOn, roundNumber: 1, createdAt: new Date(), units: ['a']});
      f.round2 = Rounds.insert({battle_id: f.battleOn, roundNumber: 2, createdAt: new Date(), units: ['b']});

      f.roomNormal = Rooms.insert({gameId: G, name: 'Normal', type: 'normal', owner: pid(0), admins: [], members: [pid(0), pid(1)],
        memberData: [], created_at: new Date()});
      f.roomKing = Rooms.insert({gameId: G, name: 'King', type: 'king', owner: pid(0), admins: [], members: [pid(0), pid(1)],
        memberData: [], created_at: new Date()});
      f.roomEveryone = Rooms.insert({gameId: G, name: 'Everyone', type: 'everyone', owner: null, admins: [], members: [pid(0), pid(1), pid(2)],
        memberData: [], created_at: new Date()});
      f.chat = Roomchats.insert({room_id: f.roomNormal, gameId: G, created_at: new Date(), user_id: uid(1), playerId: pid(1), text: 'hi'});
      f.recent = Recentchats.insert({room_id: f.roomNormal, gameId: G, updated_at: new Date()});

      f.marker = Markers.insert({gameId: G, playerId: pid(0), user_id: uid(0), name: 'm', unitType: 'castle', unitId: castle0._id, order: 0, groupId: 0});
      f.markerGroup = MarkerGroups.insert({gameId: G, playerId: pid(0), user_id: uid(0), name: 'g', order: 0});
      f.dailystat = Dailystats.insert({gameId: G, user_id: uid(0), playerId: pid(0), created_at: new Date(), income: 5});
      f.gamestat = Gamestats.insert({gameId: G, created_at: new Date(), num_users: 3, soldierWorth: 100, privateNote: 'x'});
      f.history = Markethistory.insert({gameId: G, created_at: new Date(), price: 1.5, quantity: 3, type: 'ore'});
      dTest.waitForJobs();


      // --- The check ---

      // Subscribes as `as` ('out' for logged out, or a player index) and checks
      // exactly which documents and fields arrive (dTest.checkPublication)
      function check(spec) {
        dTest.checkPublication(_.extend({}, spec, {as: spec.as === 'out' ? null : uid(spec.as), who: spec.as}));
      }

      var test = dTest.contractTest(run);
      var mapArmy = ['gameId', 'playerId', 'name', 'user_id', 'x', 'y', 'last_move_at', 'username', 'pastMoves'].concat(soldiers);
      var mapCastle = ['playerId', 'name', 'user_id', 'x', 'y', 'username', 'image'].concat(soldiers);
      var mapVillage = ['playerId', 'name', 'user_id', 'x', 'y', 'username', 'under_construction', 'level'].concat(soldiers);
      var mapCapital = ['playerId', 'x', 'y', 'name'].concat(soldiers);
      var everyone = ['out', 0, 2];


      try {

        // --- map ---

        test('armiesOnScreen, castlesOnScreen, villagesOnScreen, capitalsOnScreen: units in the countries asked for, for anyone', function() {
          everyone.forEach(function(as) {
            check({pub: 'armiesOnScreen', as: as, args: [[countryId]], coll: 'armies', source: Armies, query: {countryId: countryId}, keys: mapArmy});
            check({pub: 'castlesOnScreen', as: as, args: [[countryId]], coll: 'castles', source: Castles, query: {countryId: countryId}, keys: mapCastle});
            check({pub: 'villagesOnScreen', as: as, args: [[countryId]], coll: 'villages', source: Villages, query: {countryId: countryId}, keys: mapVillage});
            check({pub: 'capitalsOnScreen', as: as, args: [[countryId]], coll: 'capitals', source: Capitals, query: {countryId: countryId}, keys: mapCapital});
          });
          // a single id instead of a list is refused by check()
          check({pub: 'castlesOnScreen', as: 0, args: [countryId], error: 400});
        });

        test('armiesInCountry, castlesInCountry, villagesInCountry, capitalsInCountry: units in one country, logged in only', function() {
          check({pub: 'armiesInCountry', as: 2, args: [countryId], coll: 'armies', source: Armies, query: {countryId: countryId}, keys: mapArmy});
          check({pub: 'castlesInCountry', as: 2, args: [countryId], coll: 'castles', source: Castles, query: {countryId: countryId}, keys: mapCastle});
          check({pub: 'villagesInCountry', as: 2, args: [countryId], coll: 'villages', source: Villages, query: {countryId: countryId}, keys: mapVillage});
          check({pub: 'capitalsInCountry', as: 2, args: [countryId], coll: 'capitals', source: Capitals, query: {countryId: countryId}, keys: mapCapital});
          ['armiesInCountry', 'castlesInCountry', 'villagesInCountry', 'capitalsInCountry'].forEach(function(pub) {
            var coll = pub.replace('InCountry', '');
            check({pub: pub, as: 'out', args: [countryId], coll: coll, source: Armies, query: null});
          });
        });

        test('armiesAtHex and gamePiecesAtHex: what stands on one hex, for anyone', function() {
          var at = {x: castle0.x, y: castle0.y};
          check({pub: 'armiesAtHex', as: 'out', args: [G, at.x, at.y], coll: 'armies', source: Armies, query: {gameId: G, x: at.x, y: at.y}, keys: mapArmy});
          var v = Villages.findOne(f.village0);
          check({pub: 'gamePiecesAtHex', as: 'out', args: [G, v.x, v.y], parts: [
            {coll: 'hexes', source: Hexes, query: {gameId: G, x: v.x, y: v.y}, keys: ['playerId', 'x', 'y', 'type', 'tileImage', 'large', 'hasBuilding']},
            {coll: 'castles', source: Castles, query: {gameId: G, x: v.x, y: v.y}, keys: ['countryId'].concat(mapCastle)},
            {coll: 'villages', source: Villages, query: {_id: f.village0}, keys: ['countryId'].concat(mapVillage)},
            {coll: 'capitals', source: Capitals, query: {gameId: G, x: v.x, y: v.y}, keys: ['countryId'].concat(mapCapital)}
          ]});
          check({pub: 'gamePiecesAtHex', as: 'out', args: [G, at.x, at.y], parts: [
            {coll: 'castles', source: Castles, query: {_id: castle0._id}, keys: ['countryId'].concat(mapCastle)}
          ]});
          check({pub: 'gamePiecesAtHex', as: 'out', args: [G, 1.5, 0], coll: 'hexes', source: Hexes, query: null});
        });

        test('countries, countryOnScreen and countryIndex: country shapes and what is in them', function() {
          var shape = ['paths', 'image', 'imageWithCoords'];
          check({pub: 'countries', as: 0, args: [[countryId]], coll: 'countries', source: Countries, query: {_id: countryId}, keys: shape});
          check({pub: 'countries', as: 'out', args: [[countryId]], coll: 'countries', source: Countries, query: null});
          check({pub: 'countryOnScreen', as: 'out', args: [countryId], parts: [
            {coll: 'countries', source: Countries, query: {_id: countryId}, keys: shape},
            {coll: 'armies', source: Armies, query: {countryId: countryId}, keys: ['countryId'].concat(mapArmy)},
            {coll: 'villages', source: Villages, query: {countryId: countryId}, keys: ['countryId'].concat(mapVillage)},
            {coll: 'castles', source: Castles, query: {countryId: countryId}, keys: ['countryId'].concat(mapCastle)},
            {coll: 'capitals', source: Capitals, query: {countryId: countryId}, keys: ['countryId'].concat(mapCapital)}
          ]});
          check({pub: 'countryIndex', as: 'out', args: [G], coll: 'countryindex', source: Countries, query: {gameId: G},
            keys: ['neighbors', 'minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ', 'gameId']});
        });

        test('user_buildings_for_minimap: one player\'s buildings, into the left panel collections', function() {
          var keys = ['playerId', 'name', 'x', 'y'].concat(soldiers);
          check({pub: 'user_buildings_for_minimap', as: 'out', args: [pid(0)], parts: [
            {coll: 'left_panel_villages', source: Villages, query: {playerId: pid(0)}, keys: keys},
            {coll: 'left_panel_castle', source: Castles, query: {playerId: pid(0)}, keys: keys},
            {coll: 'left_panel_capitals', source: Capitals, query: {playerId: pid(0)}, keys: keys}
          ]});
        });


        // --- the game and the player ---

        test('game: the game\'s settings and state, for anyone', function() {
          check({pub: 'game', as: 'out', args: [G], coll: 'games', source: Games, query: {_id: G}, keys: ['isRelaxed', 'isSpeed',
            'isCrazyFast', 'isSuperSpeed', 'isKingOfHill', 'isProOnly', 'maxPlayers', 'name', 'numPlayers', 'numVillages', 'numCountries',
            'taxesCollected', 'tree', 'hasEnded', 'hasStarted', 'hasClosed', 'endDate', 'closeDate', 'lastDominusPlayerId', 'winningPlayer',
            'map_size', 'minimapBgPath', 'minimapUpdatedAt', 'minimap', 'lastIncomeUpdate', 'dominusAchieved']});
        });

        test('player: your own player, without the cached income', function() {
          var all = _.difference(_.keys(w.player(0)), ['_id', 'incomeFromVassals', 'incomeFromVillages', 'incomeFromCapitals']);
          check({pub: 'player', as: 0, args: [G], coll: 'players', source: Players, query: {_id: pid(0)}, keys: all});
          check({pub: 'player', as: 'out', args: [G], coll: 'players', source: Players, query: null});
        });

        test('null publication: global settings for everyone', function() {
          if (!Settings.findOne()) Settings.insert({isPaused: false});
          check({pub: 'game', as: 'out', args: ['none'], coll: 'settings', source: Settings, query: {}, keys: 'all'});
        });


        // --- right panel ---

        test('right panel publications: the selected player, castle, army, village or capital, for anyone', function() {
          check({pub: 'rightPanelPlayers', as: 'out', args: [pid(1)], coll: 'right_panel_players', source: Players, query: {_id: pid(1)},
            keys: ['username', 'lord', 'x', 'y', 'castle_id', 'num_allies_below', 'allies_above', 'allies_below', 'is_dominus', 'is_king',
              'income', 'losses_num', 'male', 'lastIncomeUpdate']});
          check({pub: 'castleForHexInfo', as: 'out', args: [castle0._id], coll: 'right_panel_castle', source: Castles, query: {_id: castle0._id},
            keys: ['male', 'gameId', 'playerId', 'name', 'user_id', 'x', 'y', 'username', 'image'].concat(soldiers)});
          check({pub: 'armyForHexInfo', as: 'out', args: [f.army0], coll: 'right_panel_armies', source: Armies, query: {_id: f.army0},
            keys: ['male', 'gameId', 'playerId', 'name', 'user_id', 'x', 'y', 'last_move_at', 'username', 'castle_x', 'castle_y', 'castle_id'].concat(soldiers)});
          check({pub: 'villageForHexInfo', as: 'out', args: [f.village0], coll: 'right_panel_villages', source: Villages, query: {_id: f.village0},
            keys: ['male', 'gameId', 'playerId', 'name', 'user_id', 'x', 'y', 'username', 'castle_x', 'castle_y', 'castle_id', 'income',
              'under_construction', 'created_at', 'level', 'constructionStarted', 'lastIncomeUpdate'].concat(soldiers)});
          check({pub: 'capitalForHexInfo', as: 'out', args: [f.capital], coll: 'right_panel_capitals', source: Capitals, query: {_id: f.capital},
            keys: ['lastIncomeUpdate', 'playerId', 'x', 'y', 'name', 'income'].concat(soldiers)});
          check({pub: 'rightPanelTree', as: 'out', args: [pid(1)], coll: 'right_panel_tree_players', source: Players, query: {_id: pid(0)},
            keys: ['name', 'x', 'y', 'castle_id', 'lord', 'username']});
          check({pub: 'calcPlayer', as: 'out', args: [pid(0)], coll: 'calcplayers', source: Players, query: {_id: pid(0)},
            keys: ['user_id', 'allies_below', 'allies_above', 'team', 'king', 'lord', 'vassals', 'is_dominus', 'username']});
        });


        // --- left panel ---

        test('left panel publications: your castle, villages, capitals, lords and vassals', function() {
          check({pub: 'left_panel_castle', as: 0, args: [G], coll: 'left_panel_castle', source: Castles, query: {_id: castle0._id},
            keys: ['playerId', 'name', 'x', 'y', 'user_id'].concat(soldiers)});
          check({pub: 'left_panel_villages', as: 0, args: [G], coll: 'left_panel_villages', source: Villages, query: {_id: f.village0},
            keys: ['playerId', 'name', 'x', 'y', 'user_id', 'level', 'income', 'under_construction', 'constructionStarted'].concat(soldiers),
            nested: {income: ['worth']}});
          check({pub: 'left_panel_capitals', as: 0, args: [G, pid(0)], coll: 'left_panel_capitals', source: Capitals, query: {_id: f.capital},
            keys: ['playerId', 'name', 'x', 'y', 'income'], nested: {income: ['worth']}});
          check({pub: 'left_panel_allies', as: 0, args: [G, pid(0)], coll: 'left_panel_allies', source: Players, query: {_id: pid(1)},
            keys: ['playerId', 'username', 'castle_id', 'x', 'y']});
          check({pub: 'left_panel_lords', as: 1, args: [G, pid(1)], coll: 'left_panel_lords', source: Players, query: {_id: pid(0)},
            keys: ['username', 'castle_id', 'x', 'y', 'playerId']});
          ['left_panel_castle', 'left_panel_villages'].forEach(function(pub) {
            check({pub: pub, as: 'out', args: [G], coll: pub, source: Castles, query: null});
          });
        });


        // --- your own units ---

        test('myArmies, myArmyPaths, myMarkers, myMarkerGroups: only your own', function() {
          check({pub: 'myArmies', as: 0, args: [G], coll: 'myarmies', source: Armies, query: {_id: f.army0},
            keys: ['gameId', 'playerId', 'speed', 'moveTime', 'moveDistance', 'name', 'user_id', 'x', 'y', 'last_move_at', 'username',
              'castle_x', 'castle_y', 'castle_id', 'onAllyBuilding'].concat(soldiers)});
          check({pub: 'myArmyPaths', as: 0, args: [G], coll: 'armypaths2', source: Armypaths, query: {_id: f.path0}, keys: 'all'});
          check({pub: 'myArmyPaths', as: 1, args: [G], coll: 'armypaths2', source: Armypaths, query: null});
          check({pub: 'myMarkers', as: 0, args: [pid(0)], coll: 'markers', source: Markers, query: {_id: f.marker}, keys: 'all'});
          check({pub: 'myMarkers', as: 1, args: [pid(0)], coll: 'markers', source: Markers, query: null});
          check({pub: 'myMarkerGroups', as: 0, args: [pid(0)], coll: 'markergroups', source: MarkerGroups, query: {_id: f.markerGroup}, keys: 'all'});
          check({pub: 'my_dailystats', as: 0, args: [G], coll: 'dailystats', source: Dailystats, query: {_id: f.dailystat}, keys: 'all'});
          check({pub: 'my_dailystats', as: 1, args: [G], coll: 'dailystats', source: Dailystats, query: null});
        });


        // --- alerts ---

        test('globalAlerts and globalAlert: newest first up to the number asked for, for anyone', function() {
          check({pub: 'globalAlerts', as: 'out', args: [G, 1], coll: 'globalalerts', source: GlobalAlerts, query: {_id: f.gAlertNew}, keys: 'all'});
          check({pub: 'globalAlerts', as: 'out', args: [G, 10], coll: 'globalalerts', source: GlobalAlerts, query: {gameId: G}, keys: 'all'});
          check({pub: 'globalAlert', as: 'out', args: [f.gAlertOld], coll: 'globalalerts', source: GlobalAlerts, query: {_id: f.gAlertOld}, keys: 'all'});
        });

        test('myAlerts and unreadAlerts: alerts sent to a player, without hidden types', function() {
          check({pub: 'myAlerts', as: 0, args: [pid(0), 10, ['alert_villageDestroyed']], coll: 'alerts', source: Alerts,
            query: {_id: {$in: [f.alertUnread, f.alertRead]}}, keys: 'all'});
          check({pub: 'myAlerts', as: 0, args: [pid(0), 1, []], coll: 'alerts', source: Alerts, query: {_id: f.alertUnread}, keys: 'all'});
          check({pub: 'myAlerts', as: 0, args: [pid(0), 10, 'nope'], error: 400});
          check({pub: 'unreadAlerts', as: 0, args: [pid(0), ['alert_villageDestroyed']], coll: 'unreadalerts', source: Alerts,
            query: {_id: f.alertUnread}, keys: []});
          // the browser sends null when the player has hidden nothing
          check({pub: 'unreadAlerts', as: 0, args: [pid(0), null], coll: 'unreadalerts', source: Alerts,
            query: {_id: {$in: [f.alertUnread, f.alertHidden]}}, keys: []});
          check({pub: 'unreadAlerts', as: 0, args: [pid(0)], error: 400});
          check({pub: 'unreadAlerts', as: 0, args: [5, null], error: 400});
        });

        test('myAlerts and unreadAlerts: any logged in user can read any player\'s alerts by id (known bug, security audit)', function() {
          check({pub: 'myAlerts', as: 2, args: [pid(0), 10, []], coll: 'alerts', source: Alerts,
            query: {_id: {$in: [f.alertUnread, f.alertRead, f.alertHidden]}}, keys: 'all'});
          check({pub: 'unreadAlerts', as: 'out', args: [pid(0), null], coll: 'unreadalerts', source: Alerts,
            query: {_id: {$in: [f.alertUnread, f.alertHidden]}}, keys: []});
        });

        test('alert detail publications: the unit an alert is about, for anyone', function() {
          var unitKeys = ['playerId', 'name', 'username', 'x', 'y', 'castle_id'];
          check({pub: 'alertPlayer', as: 'out', args: [pid(1)], coll: 'alertplayers', source: Players, query: {_id: pid(1)},
            keys: ['userId', 'username', 'x', 'y', 'castle_id']});
          check({pub: 'alertArmy', as: 'out', args: [f.army1], coll: 'alertarmies', source: Armies, query: {_id: f.army1}, keys: unitKeys});
          check({pub: 'alertVillage', as: 'out', args: [f.village0], coll: 'alertvillages', source: Villages, query: {_id: f.village0}, keys: unitKeys});
          check({pub: 'alertCastle', as: 'out', args: [castle0._id], coll: 'alertcastles', source: Castles, query: {_id: castle0._id}, keys: unitKeys});
          check({pub: 'alertCapital', as: 'out', args: [f.capital], coll: 'alertcapitals', source: Capitals, query: {_id: f.capital}, keys: ['playerId', 'x', 'y']});
          check({pub: 'alertChatroom', as: 'out', args: [f.roomNormal], coll: 'alertchatrooms', source: Rooms, query: {_id: f.roomNormal}, keys: ['name']});
          check({pub: 'battleAlertTitles', as: 'out', args: [G, 10], coll: 'alertbattletitles', source: Battles2, query: {gameId: G},
            keys: ['createdAt', 'updatedAt', 'isOver', 'x', 'y', 'titleInfo', 'gameId']});
        });


        // --- battles ---

        test('battle publications: battles, fights and round titles, for anyone', function() {
          var titleKeys = ['createdAt', 'updatedAt', 'isOver', 'x', 'y', 'titleInfo', 'gameId'];
          var b = Battles2.findOne(f.battleOn);
          check({pub: 'battle', as: 'out', args: [f.battleOn], coll: 'battles2', source: Battles2, query: {_id: f.battleOn}, keys: 'all'});
          check({pub: 'battle_notifications_at_hex', as: 'out', args: [G, b.x, b.y], coll: 'battles2', source: Battles2,
            query: {_id: f.battleOn}, keys: titleKeys});
          check({pub: 'fight', as: 'out', args: [f.round1], coll: 'rounds', source: Rounds, query: {_id: f.round1}, keys: 'all'});
          check({pub: 'lastFightInBattle', as: 'out', args: [f.battleOn], coll: 'rounds', source: Rounds, query: {_id: f.round2}, keys: 'all'});
          check({pub: 'roundtitles', as: 'out', args: [f.battleOn], coll: 'roundtitles', source: Rounds, query: {battle_id: f.battleOn},
            keys: ['roundNumber', 'battle_id', 'createdAt']});
        });


        // --- chat ---

        test('chat publications: your rooms, the everyone room, chats and recent chats', function() {
          check({pub: 'myNormalChatrooms', as: 1, args: [G, pid(1)], coll: 'rooms', source: Rooms, query: {_id: f.roomNormal}, keys: 'all'});
          check({pub: 'myKingChatrooms', as: 1, args: [G, pid(1)], coll: 'rooms', source: Rooms, query: {_id: f.roomKing}, keys: 'all'});
          check({pub: 'everyoneChatroom', as: 2, args: [G], coll: 'rooms', source: Rooms, query: {_id: f.roomEveryone}, keys: 'all'});
          check({pub: 'roomchats', as: 1, args: [f.roomNormal], coll: 'roomchats', source: Roomchats, query: {_id: f.chat}, keys: 'all'});
          check({pub: 'recentchats', as: 1, args: [[f.roomNormal]], coll: 'recentchats', source: Recentchats, query: {_id: f.recent}, keys: 'all'});
          check({pub: 'room_list', as: 1, args: [G, pid(1)], coll: 'room_list', source: Rooms, query: {members: pid(1)}, keys: []});
          check({pub: 'myNormalChatrooms', as: 'out', args: [G, pid(1)], coll: 'rooms', source: Rooms, query: null});
          check({pub: 'everyoneChatroom', as: 'out', args: [G], coll: 'rooms', source: Rooms, query: null});
          check({pub: 'roomchats', as: 'out', args: [f.roomNormal], coll: 'roomchats', source: Roomchats, query: null});
          check({pub: 'recentchats', as: 'out', args: [[f.roomNormal]], coll: 'recentchats', source: Recentchats, query: null});
        });

        test('chat publications: a player outside a room can read its chats and membership by id (known bug, security audit)', function() {
          check({pub: 'roomchats', as: 2, args: [f.roomNormal], coll: 'roomchats', source: Roomchats, query: {_id: f.chat}, keys: 'all'});
          check({pub: 'myNormalChatrooms', as: 2, args: [G, pid(1)], coll: 'rooms', source: Rooms, query: {_id: f.roomNormal}, keys: 'all'});
          check({pub: 'room_list', as: 'out', args: [G, pid(1)], coll: 'room_list', source: Rooms, query: {members: pid(1)}, keys: []});
        });


        // --- rankings, market, stats, dominus ---

        test('rankings: a page of players, villages or capitals, ordered, for anyone', function() {
          var playerKeys = ['username', 'castle_id', 'x', 'y', 'is_king', 'userId'];
          check({pub: 'income_rankings', as: 'out', args: [G, 1], coll: 'income_rankings', source: Players, query: {gameId: G},
            keys: ['income'].concat(playerKeys)});
          check({pub: 'ally_rankings', as: 'out', args: [G, 1], coll: 'ally_rankings', source: Players, query: {gameId: G},
            keys: ['num_allies_below'].concat(playerKeys)});
          check({pub: 'losses_rankings', as: 'out', args: [G, 1], coll: 'losses_rankings', source: Players, query: {gameId: G},
            keys: ['losses_worth', 'losses_num'].concat(playerKeys)});
          check({pub: 'income_rankings', as: 'out', args: [G, 2], coll: 'income_rankings', source: Players, query: null});
          check({pub: 'country_rankings', as: 'out', args: [G, 1], coll: 'country_rankings', source: Capitals, query: {gameId: G},
            keys: ['name', 'x', 'y', 'income', 'userId', 'playerId'], nested: {income: ['worth']}});
          check({pub: 'village_rankings', as: 'out', args: [G, 1], coll: 'village_rankings', source: Villages, query: {gameId: G, under_construction: false},
            keys: ['username', 'name', 'castle_id', 'castle_x', 'castle_y', 'x', 'y', 'income', 'userId', 'playerId'], nested: {income: ['worth']}});
        });

        test('rankings: a page is the next perPage players by the ranking', function() {
          equal(_s.panels.rankings.perPage, 10, 'perPage');
          // 10 more players with incomes 21..30, so the 13 players in income order are
          // p0 (50), the extras 30..21, p1 (20), p2 (10)
          var extras = _.range(21, 31).map(function(income) {
            return Players.insert({gameId: G, userId: Random.id(), username: 'rank' + income, income: income,
              castle_id: castle0._id, x: 0, y: 0, is_king: true});
          });
          var client = dTest.ddp.connect();
          try {
            var ranked = client.collection('income_rankings');
            var byIncome = extras.slice().reverse();
            var page1 = client.subscribe('income_rankings', G, 1);
            equal(_.pluck(ranked.find({}, {sort: {income: -1}}).fetch(), '_id').join(','),
              [pid(0)].concat(byIncome.slice(0, 9)).join(','), 'page 1: the top 10, highest first');
            page1.stop();
            assert(dTest.waitFor(function() { return ranked.find().count() == 0; }, 5000), 'page 1 removed on stop');
            client.subscribe('income_rankings', G, 2);
            equal(_.pluck(ranked.find({}, {sort: {income: -1}}).fetch(), '_id').join(','),
              [byIncome[9], pid(1), pid(2)].join(','), 'page 2: the rest');
          } finally {
            client.close();
            Players.remove({_id: {$in: extras}});
          }
        });

        test('dominus, market and stats publications, for anyone', function() {
          var dominusKeys = ['username', 'castle_id', 'x', 'y', 'is_dominus', 'userId'];
          check({pub: 'dominus_rankings', as: 'out', args: [G], coll: 'dominusplayer', source: Players, query: {_id: pid(2)}, keys: dominusKeys});
          check({pub: 'dominusPopupGameId', as: 'out', args: [G], coll: 'dominusplayer', source: Players, query: {_id: pid(2)}, keys: dominusKeys});
          check({pub: 'dominusPopupPlayer', as: 'out', args: [pid(1)], coll: 'dominusplayer', source: Players, query: {_id: pid(1)}, keys: dominusKeys});
          check({pub: 'market', as: 'out', args: [G], coll: 'market', source: Market, query: {gameId: G}, keys: 'all'});
          check({pub: 'markethistory', as: 'out', args: [G], coll: 'markethistory', source: Markethistory, query: {gameId: G},
            keys: ['created_at', 'price', 'quantity']});
          check({pub: 'stats_gamestats', as: 'out', args: [G], coll: 'gamestats', source: Gamestats, query: {_id: f.gamestat},
            keys: ['num_users', 'created_at', 'soldierWorth']});
        });


        // --- reactivity ---

        test('changes reach a subscriber: added, changed and removed', function() {
          var client = dTest.ddp.connect(uid(0));
          try {
            var castles = client.collection('castles');
            var mine = client.collection('myarmies');
            var chats = client.collection('roomchats');
            client.subscribe('castlesOnScreen', [countryId]);
            client.subscribe('myArmies', G);
            client.subscribe('roomchats', f.roomNormal);

            Castles.update(castle0._id, {$set: {name: 'Renamed Castle'}});
            assert(dTest.waitFor(function() { var c = castles.findOne(castle0._id); return c && c.name == 'Renamed Castle'; }, 5000), 'changed');

            var army = w.makeArmy(0, {catapults: 1});
            assert(dTest.waitFor(function() { return mine.findOne(army._id); }, 5000), 'added');
            dTest.settle(dArmies.destroyArmy(army._id));
            assert(dTest.waitFor(function() { return !mine.findOne(army._id); }, 5000), 'removed');

            var chatId = Roomchats.insert({room_id: f.roomNormal, gameId: G, created_at: new Date(), user_id: uid(0), playerId: pid(0), text: 'live'});
            assert(dTest.waitFor(function() { return chats.findOne(chatId); }, 5000), 'a new chat arrives');
          } finally {
            client.close();
          }
        });

      } finally {
        dTest.waitForJobs();
        Rounds.remove({battle_id: {$in: [f.battleOn, f.battleOver]}});
        w.cleanup();
        dTest.ddp.resetRateLimits();
      }
    });
  });
}
