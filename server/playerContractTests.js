// Method contracts: names, player settings, alerts, markers, reports and
// leaving a game (Oct 2026).
//
// Same approach as server/armyContractTests.js: each method is called over a
// real DDP connection as a player in a real started game, and the tests pin
// down what a successful call changes and that a refused call changes
// nothing. A test named "known bug" describes a bug in today's code.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    dTest.addSuite('method contracts: names, settings, alerts and markers (server/playerContractTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var expectError = dTest.expectError;

      var w = dTest.buildGameWorld({players: 3});
      var clients = w.users.map(function(user) { return dTest.ddp.connect(user._id); });
      var usernames = w.players.map(function(p) { return p.username; });

      function markersOf(i) {
        return Markers.find({user_id: w.users[i]._id}, {sort: {order: 1}}).fetch();
      }

      function groupsOf(i) {
        return MarkerGroups.find({user_id: w.users[i]._id}, {sort: {order: 1}}).fetch();
      }

      function insertAlert(type, playerIdxs) {
        return Alerts.insert({gameId: w.gameId, created_at: new Date(), type: type, vars: {},
          playerIds: playerIdxs.map(function(i) { return {playerId: w.players[i]._id, read: false}; })});
      }

      function readFlag(alertId, i) {
        return _.findWhere(Alerts.findOne(alertId).playerIds, {playerId: w.players[i]._id}).read;
      }

      var test = dTest.contractTest(run, function() {
        w.removeArmies();
        w.users.forEach(function(user) {
          Markers.remove({user_id: user._id});
          MarkerGroups.remove({user_id: user._id});
        });
        Alerts.remove({gameId: w.gameId});
        GlobalAlerts.remove({gameId: w.gameId});
        // put names back, through the DB, so later tests see the originals
        w.players.forEach(function(p, i) {
          Players.update(p._id, {$set: {username: usernames[i]}});
          Castles.update({playerId: p._id}, {$set: {username: usernames[i]}});
        });
      });


      try {

        // --- change_username ---

        test('change_username: renames the player everywhere their name is copied', function() {
          var army = w.makeArmy(0, {footmen: 1});
          var name = 'Renamed ' + Random.id(4).replace(/[^a-zA-Z0-9]/g, 'x');
          clients[0].call('change_username', w.players[0]._id, name + '!!');
          equal(w.player(0).username, name, 'player renamed, characters other than letters, digits, _ and spaces dropped');
          equal(w.castle(0).username, name, 'castle');
          equal(Armies.findOne(army._id).username, name, 'army');
          var alert = GlobalAlerts.findOne({gameId: w.gameId, type: 'ga_nameChange'});
          assert(alert, 'a global alert is made');
        });

        test('change_username: bad names, taken names and someone else\'s player are refused', function() {
          var before = dTest.snapshot(w.gameId);
          var rename = function(i, name) {
            return function() { return clients[0].call('change_username', w.players[i]._id, name); };
          };
          expectError(rename(0, 'ab'), 'New username must be at least 3 characters long.', null, 'too short');
          expectError(rename(0, '$$ab$$'), 'New username must be at least 3 characters long.', null, 'too short once cleaned');
          expectError(rename(0, 'a'.repeat(26)), 'New username is too long.', null, 'too long');
          expectError(rename(0, 'Danimal'), 'You are not Danimal.', null, 'Danimal');
          expectError(rename(0, usernames[0]), 'You\'re already named ' + usernames[0], null, 'same name');
          dTest.ddp.resetRateLimits();
          expectError(rename(0, usernames[1].toUpperCase()), 'A player exists with this username, try another.', null, 'taken, any case');
          expectError(rename(1, 'Someone Else'), 'No player found.', null, 'someone else\'s player');
          dTest.assertUnchanged(w.gameId, before, 'a refused rename changed the game');
        });


        // --- edit_name ---

        test('edit_name: renames your own castle, village or army', function() {
          var army = w.makeArmy(0, {footmen: 1});
          clients[0].call('edit_name', 'castle', w.castles[0]._id, 'Keep  of   Tests', w.players[0]._id);
          equal(w.castle(0).name, 'Keep of Tests', 'castle renamed, spaces collapsed');
          clients[0].call('edit_name', 'army', army._id, 'The Testers', w.players[0]._id);
          equal(Armies.findOne(army._id).name, 'The Testers', 'army renamed');
        });

        test('edit_name: names too long or empty are refused, and someone else\'s unit is left alone', function() {
          var before = dTest.snapshot(w.gameId);
          expectError(function() { return clients[0].call('edit_name', 'castle', w.castles[0]._id, 'x'.repeat(31), w.players[0]._id); },
            'Name must be less than 30 characters.', null, 'too long');
          expectError(function() { return clients[0].call('edit_name', 'castle', w.castles[0]._id, '', w.players[0]._id); },
            'Name is too short.', null, 'empty');
          equal(clients[0].call('edit_name', 'castle', w.castles[1]._id, 'Mine Now', w.players[0]._id), undefined, 'someone else\'s castle: no error');
          dTest.assertUnchanged(w.gameId, before, 'a refused rename changed the game');
        });

        test('edit_name: naming someone else\'s player fails with an internal error (known bug: no player check)', function() {
          var before = dTest.snapshot(w.gameId);
          expectError(function() { return clients[0].call('edit_name', 'castle', w.castles[1]._id, 'Mine Now', w.players[1]._id); },
            500, null, 'someone else\'s player');
          dTest.assertUnchanged(w.gameId, before, 'a failed rename changed the game');
        });


        // --- reportPlayer ---

        test('reportPlayer: always fails on the server, since it reads Session (known bug)', function() {
          var before = dTest.snapshot(w.gameId, [Players, Reports, GlobalAlerts]);
          expectError(function() { return clients[0].call('reportPlayer', w.players[1]._id, 'is a test of reports'); },
            500, null, 'a valid report');
          equal(Reports.find({reportedPlayerId: w.players[1]._id}).count(), 0, 'no report saved');
          dTest.assertUnchanged(w.gameId, before, 'a failed report changed the game', [Players, Reports, GlobalAlerts]);
        });


        // --- player settings ---

        test('setHexScale: sets your hex scale, kept between the min and max', function() {
          clients[0].call('setHexScale', w.players[0]._id, 0.7);
          equal(w.player(0).hex_scale, 0.7, 'in range');
          clients[0].call('setHexScale', w.players[0]._id, 5);
          equal(w.player(0).hex_scale, _s.init.hexScaleMax, 'clamped to max');
          clients[0].call('setHexScale', w.players[0]._id, '0.1');
          equal(w.player(0).hex_scale, _s.init.hexScaleMin, 'a numeric string, clamped to min');
          var theirs = w.player(1).hex_scale;
          clients[0].call('setHexScale', w.players[1]._id, 0.8);
          equal(w.player(1).hex_scale, theirs, 'someone else\'s scale is left alone');
          expectError(function() { return clients[0].call('setHexScale', w.players[0]._id, 'big'); }, 400, null, 'not a number');
        });

        test('show and hide settings: each sets its flag on your own player only', function() {
          // [method suffix, Players field, argument: 'game' or 'player']
          var flags = [
            ['castle', 'lp_show_castle', 'game'], ['villages', 'lp_show_villages', 'game'], ['armies', 'lp_show_armies', 'game'],
            ['lords', 'lp_show_lords', 'game'], ['allies', 'lp_show_allies', 'game'],
            ['coords', 'sp_show_coords', 'player'], ['minimap', 'sp_show_minimap', 'player']
          ];
          flags.forEach(function(flag) {
            var arg = flag[2] == 'game' ? w.gameId : w.players[0]._id;
            clients[0].call('hide_' + flag[0], arg);
            equal(w.player(0)[flag[1]], false, 'hide_' + flag[0]);
            clients[0].call('show_' + flag[0], arg);
            equal(w.player(0)[flag[1]], true, 'show_' + flag[0]);
          });
          clients[0].call('hide_welcome_screen', w.gameId);
          equal(w.player(0).show_welcome_screen, false, 'hide_welcome_screen');

          // the ones that take a player id only change the caller's own player
          Players.update(w.players[1]._id, {$set: {sp_show_coords: true, sp_show_minimap: true}});
          clients[0].call('hide_coords', w.players[1]._id);
          clients[0].call('hide_minimap', w.players[1]._id);
          equal(w.player(1).sp_show_coords, true, 'someone else\'s coords setting is left alone');
          equal(w.player(1).sp_show_minimap, true, 'someone else\'s minimap setting is left alone');
        });


        // --- alerts ---

        test('hideAlertMine and showAlertMine: hide and show one alert type for you', function() {
          clients[0].call('hideAlertMine', w.players[0]._id, 'alert_receivedArmy');
          clients[0].call('hideAlertMine', w.players[0]._id, 'alert_receivedArmy');
          equal(JSON.stringify(w.player(0).hideAlertsMine), JSON.stringify(['alert_receivedArmy']), 'hidden once');
          clients[0].call('showAlertMine', w.players[0]._id, 'alert_receivedArmy');
          equal(JSON.stringify(w.player(0).hideAlertsMine), '[]', 'shown again');
          var before = dTest.snapshot(w.gameId);
          expectError(function() { return clients[0].call('hideAlertMine', w.players[0]._id, 'alert_madeUp'); }, 'Alert type not found.', null, 'unknown type');
          clients[0].call('hideAlertMine', w.players[1]._id, 'alert_receivedArmy');
          dTest.assertUnchanged(w.gameId, before, 'a refused or someone else\'s hide changed the game');
        });

        test('markAlertAsRead and markAllAlertsAsRead: mark your own copy read', function() {
          var shared = insertAlert('alert_receivedArmy', [0, 1]);
          var mine = insertAlert('alert_battleStart', [0]);
          var theirs = insertAlert('alert_battleStart', [1]);
          clients[0].call('markAlertAsRead', w.gameId, shared);
          equal(readFlag(shared, 0), true, 'your copy is read');
          equal(readFlag(shared, 1), false, 'the other player\'s copy is not');
          clients[0].call('markAlertAsRead', w.gameId, theirs);
          equal(readFlag(theirs, 1), false, 'someone else\'s alert is left alone');
          clients[0].call('markAllAlertsAsRead', w.players[0]._id);
          equal(readFlag(mine, 0), true, 'all of yours are read');
          equal(readFlag(shared, 1), false, 'others still unread');
          expectError(function() { return clients[0].call('markAllAlertsAsRead', w.players[1]._id); }, 'No player found.', null, 'someone else\'s player');
          equal(readFlag(theirs, 1), false, 'still unread');
        });

        // The alert methods run as a simulation in the browser too (upgrade
        // PR 18): each is sync, and ends where the real calls do.
        test('alert simulations: each is sync, and ends where the real calls do', function() {
          var user = w.users[0]._id;
          var me = w.players[0]._id;
          var simulation = {userId: user, isSimulation: true, connection: null, unblock: function() {}, setUserId: function() {}};
          var server = {userId: user, isSimulation: false, connection: null, unblock: function() {}, setUserId: function() {}};
          var simulate = function(name, args) {
            var returned = Meteor.server.method_handlers[name].apply(simulation, args);
            assert(!dTest.isPromise(returned), name + ': the simulation is sync');
            equal(returned, undefined, name + ' simulation returns nothing');
          };
          var real = function(name, args) {
            dTest.ddp.resetRateLimits();
            equal(clients[0].call.apply(null, [name].concat(args)), undefined, name + ' returns nothing');
          };
          var ids = [];
          var state = function() {
            return JSON.stringify({
              hidden: w.player(0).hideAlertsMine,
              read: ids.map(function(id) { return _.pluck(Alerts.findOne(id).playerIds, 'read'); })
            });
          };
          var play = function(call) {
            Players.update(me, {$set: {hideAlertsMine: []}});
            ids = [insertAlert('alert_receivedArmy', [0, 1]), insertAlert('alert_battleStart', [0]), insertAlert('alert_battleStart', [0, 1])];
            call('hideAlertMine', [me, 'alert_receivedArmy']);
            call('hideAlertMine', [me, 'alert_battleStart']);
            call('showAlertMine', [me, 'alert_receivedArmy']);
            call('markAlertAsRead', [w.gameId, ids[0]]);
            var middle = state();
            call('markAllAlertsAsRead', [me]);
            var end = state();
            Alerts.remove({_id: {$in: ids}});
            return [middle, end];
          };

          var fromServer = play(real);
          var fromSimulations = play(simulate);
          equal(fromSimulations[0], fromServer[0], 'after hiding, showing and reading one');
          equal(fromSimulations[1], fromServer[1], 'after reading all');
          equal(fromServer[0], JSON.stringify({hidden: ['alert_battleStart'], read: [[true, false], [false], [false, false]]}), 'the middle');
          equal(fromServer[1], JSON.stringify({hidden: ['alert_battleStart'], read: [[true, false], [true], [true, false]]}), 'the end');
          Players.update(me, {$set: {hideAlertsMine: []}});

          // the server's part is async
          var returned = Meteor.server.method_handlers.markAllAlertsAsRead.apply(server, [me]);
          assert(dTest.isPromise(returned), 'the server\'s part is a promise');
          equal(dTest.settle(returned), undefined, 'that returns nothing');

          // a refused simulation throws, as the real call does
          var error = dTest.throws(function() {
            return Meteor.server.method_handlers.markAllAlertsAsRead.apply(simulation, [w.players[1]._id]);
          });
          equal(error && error.error, 'No player found.', 'refused in the simulation too');
          error = dTest.throws(function() {
            return Meteor.server.method_handlers.hideAlertMine.apply(simulation, [me, 'alert_madeUp']);
          });
          equal(error && error.error, 'Alert type not found.', 'an unknown type too');
        });


        // --- markers ---

        test('addMarker and addMarkerCoords: mark a unit or a hex, up to the non-pro limit', function() {
          equal(clients[0].call('addMarker', w.gameId, 'castle', w.castles[1]._id), undefined, 'returns nothing (the new id is not returned)');
          var hex = w.freeHex();
          clients[0].call('addMarkerCoords', w.gameId, 'hex', hex.x, hex.y);
          var markers = markersOf(0);
          equal(markers.length, 2, 'two markers');
          equal(markers[0].name, usernames[1] + '\'s castle', 'castle marker name');
          equal(markers[0].unitType + ',' + markers[0].unitId, 'castle,' + w.castles[1]._id, 'castle marker unit');
          equal(markers[1].name, 'hex ' + hex.x + ',' + hex.y, 'hex marker name');
          equal(_.pluck(markers, 'order').join(','), '0,1', 'order');
          equal(markers[0].groupId, 0, 'default group');

          var max = _s.markers.maxMarkersNonPro;
          equal(max, 2, 'non-pro marker limit');
          var before = dTest.snapshot(w.gameId, [Markers]);
          expectError(function() { return clients[0].call('addMarker', w.gameId, 'castle', w.castles[2]._id); },
            'Only ' + max + ' markers allowed.', null, 'over the limit');
          dTest.assertUnchanged(w.gameId, before, 'a refused marker changed the game', [Markers]);
        });

        test('addMarker: a duplicate or a unit that doesn\'t exist is refused; pro players get more', function() {
          clients[0].call('addMarker', w.gameId, 'castle', w.castles[1]._id);
          var before = dTest.snapshot(w.gameId, [Markers]);
          expectError(function() { return clients[0].call('addMarker', w.gameId, 'castle', w.castles[1]._id); },
            'You already have a marker here.', null, 'duplicate');
          expectError(function() { return clients[0].call('addMarker', w.gameId, 'army', 'nope'); }, 'no unit found', null, 'no such army');
          expectError(function() { return clients[0].call('addMarkerCoords', w.gameId, 'hex', 5000, 5000); }, 'no unit found', null, 'no such hex');
          dTest.assertUnchanged(w.gameId, before, 'a refused marker changed the game', [Markers]);

          Players.update(w.players[0]._id, {$set: {pro: true}});
          try {
            clients[0].call('addMarker', w.gameId, 'castle', w.castles[2]._id);
            clients[0].call('addMarker', w.gameId, 'castle', w.castles[0]._id);
            equal(markersOf(0).length, 3, 'a pro player can go past the non-pro limit');
          } finally {
            Players.update(w.players[0]._id, {$set: {pro: false}});
          }
        });

        test('marker editing: rename, reorder and remove only your own markers', function() {
          clients[0].call('addMarker', w.gameId, 'castle', w.castles[1]._id);
          clients[0].call('addMarker', w.gameId, 'castle', w.castles[2]._id);
          var m = markersOf(0);
          clients[0].call('saveMarkerInfo', m[0]._id, 'Their <b>Keep', 'Watch out!');
          var doc = Markers.findOne(m[0]._id);
          equal(doc.name + '|' + doc.description, 'Their bKeep|Watch out', 'name and description cleaned');
          expectError(function() { return clients[0].call('saveMarkerInfo', m[0]._id, '!!!', ''); }, 'Name too short.', null, 'empty name');
          expectError(function() { return clients[0].call('saveMarkerInfo', m[0]._id, 'x'.repeat(36), ''); }, 'Name too long.', null, 'long name');

          clients[0].call('setMarkerOrder', m[1]._id, 0, 0, 1, 0);
          equal(_.pluck(markersOf(0), '_id').join(','), [m[1]._id, m[0]._id].join(','), 'reordered');

          // someone else can't touch them
          clients[1].call('saveMarkerInfo', m[0]._id, 'Hacked', '');
          clients[1].call('removeMarker', m[0]._id);
          equal(Markers.findOne(m[0]._id).name, 'Their bKeep', 'someone else\'s rename is ignored');

          clients[0].call('removeMarker', m[0]._id);
          equal(Markers.find(m[0]._id).count(), 0, 'removed');
        });

        test('marker groups: add, rename, reorder and remove, up to the non-pro limit', function() {
          clients[0].call('addMarkerGroup', w.gameId, 'First <Group>');
          clients[0].call('addMarkerGroup', w.gameId, 'Second');
          var g = groupsOf(0);
          equal(_.pluck(g, 'name').join('|'), 'First Group|Second', 'names cleaned, in order');
          equal(_.pluck(g, 'order').join(','), '0,1', 'order');
          equal(_s.markers.maxGroupsNonPro, 2, 'non-pro group limit');
          expectError(function() { return clients[0].call('addMarkerGroup', w.gameId, 'Third'); }, 'Too many groups.  Limited to 2', null, 'over the limit');
          expectError(function() { return clients[0].call('addMarkerGroup', w.gameId, '***'); }, 'Name too short.', null, 'empty name');

          clients[0].call('saveMarkerGroupInfo', g[1]._id, 'Renamed!');
          equal(MarkerGroups.findOne(g[1]._id).name, 'Renamed', 'renamed');

          clients[0].call('moveMarkerGroupUp', g[1]._id);
          equal(_.pluck(groupsOf(0), '_id').join(','), [g[1]._id, g[0]._id].join(','), 'moved up');
          equal(_.pluck(groupsOf(0), 'order').join(','), '0,1', 'orders renumbered');
          clients[0].call('moveMarkerGroupDown', g[1]._id);
          equal(_.pluck(groupsOf(0), '_id').join(','), [g[0]._id, g[1]._id].join(','), 'moved down');

          // removing a group removes the markers in it
          clients[0].call('addMarker', w.gameId, 'castle', w.castles[1]._id);
          var marker = markersOf(0)[0];
          clients[0].call('setMarkerOrder', marker._id, 0, g[1]._id, 0, 0);
          equal(Markers.findOne(marker._id).groupId, g[1]._id, 'marker moved into the group');
          clients[1].call('removeMarkerGroup', g[1]._id);
          equal(MarkerGroups.find(g[1]._id).count(), 1, 'someone else can\'t remove it');
          clients[0].call('removeMarkerGroup', g[1]._id);
          equal(MarkerGroups.find(g[1]._id).count(), 0, 'group removed');
          equal(Markers.find(marker._id).count(), 0, 'its markers removed');
          equal(groupsOf(0)[0].order, 0, 'remaining group renumbered');
        });


        // The browser runs each shared marker method as a simulation first, a
        // sync copy of the change behind this.isSimulation; the server runs
        // the async part the method returns. These run the simulation here, on
        // the server's collections, and check that it is sync (two async
        // simulations that overlap throw in the browser on 2.16) and ends
        // where the real calls do. tests/e2e/specs/markers.spec.js checks it
        // in the browser. The handler is called with the invocation as this,
        // not inside DDP._CurrentMethodInvocation.withValue, which on 2.16
        // waits for a promise it is handed.
        test('marker simulations: each is sync, and ends where the real calls do', function() {
          var user = w.users[0]._id;
          var simulation = {userId: user, isSimulation: true, connection: null, unblock: function() {}, setUserId: function() {}};
          var server = {userId: user, isSimulation: false, connection: null, unblock: function() {}, setUserId: function() {}};
          var simulate = function(name, args) {
            var returned = Meteor.server.method_handlers[name].apply(simulation, args);
            assert(!dTest.isPromise(returned), name + ': the simulation is sync');
            equal(returned, undefined, name + ' simulation returns nothing');
          };
          // and the server's part is async (removeMarker of nothing: no change)
          var returned = Meteor.server.method_handlers.removeMarker.apply(server, ['nothing']);
          assert(dTest.isPromise(returned), 'the server\'s part is a promise');
          equal(dTest.settle(returned), undefined, 'that returns nothing');
          var real = function(name, args) {
            clients[0].call.apply(null, [name].concat(args));
          };
          // markers and groups, with group ids as names and no ids or dates
          var state = function() {
            var groups = groupsOf(0);
            var groupName = function(id) { return id === 0 ? 'default' : (_.findWhere(groups, {_id: id}) || {}).name; };
            return JSON.stringify({
              groups: groups.map(function(g) { return [g.name, g.order, g.gameId, g.playerId]; }),
              markers: _.sortBy(markersOf(0), function(m) { return groupName(m.groupId) + '/' + m.order; }).map(function(m) {
                return [m.name, m.description, m.unitId, groupName(m.groupId), m.order];
              }),
              hexScale: w.player(0).hex_scale
            });
          };
          var reset = function() {
            Markers.remove({user_id: user});
            MarkerGroups.remove({user_id: user});
            Players.update(w.players[0]._id, {$set: {hex_scale: 1}});
          };
          var groupId = function(name) { return MarkerGroups.findOne({user_id: user, name: name})._id; };
          var markerId = function(unitId) { return Markers.findOne({user_id: user, unitId: unitId})._id; };

          var play = function(call) {
            reset();
            // addMarker has no simulation: it runs on the server only
            real('addMarker', [w.gameId, 'castle', w.castles[1]._id]);
            real('addMarker', [w.gameId, 'castle', w.castles[2]._id]);
            call('addMarkerGroup', [w.gameId, 'Alpha <1>']);
            call('addMarkerGroup', [w.gameId, 'Beta']);
            call('saveMarkerGroupInfo', [groupId('Beta'), 'Gamma!']);
            call('moveMarkerGroupUp', [groupId('Gamma')]);
            call('moveMarkerGroupDown', [groupId('Alpha 1')]);
            call('setMarkerOrder', [markerId(w.castles[2]._id), 0, groupId('Gamma'), 1, 0]);
            call('setMarkerOrder', [markerId(w.castles[1]._id), 0, 0, 0, 0]);
            call('saveMarkerInfo', [markerId(w.castles[1]._id), 'Keep <b>', 'Look out']);
            call('moveMarkerGroupDown', [groupId('Gamma')]);
            call('fixMarkerGroupOrder', []);
            call('setHexScale', [w.players[0]._id, 0.8]);
            var middle = state();
            call('removeMarker', [markerId(w.castles[1]._id)]);
            call('removeMarkerGroup', [groupId('Gamma')]);
            return [middle, state()];
          };

          var fromServer = play(real);
          var fromSimulations = play(simulate);
          equal(fromSimulations[0], fromServer[0], 'after adding, renaming and moving');
          equal(fromSimulations[1], fromServer[1], 'after removing');
          var middle = JSON.parse(fromServer[0]);
          equal(JSON.stringify(_.map(middle.groups, _.first)), '["Alpha 1","Gamma"]', 'the groups it ends with');
          equal(middle.hexScale, 0.8, 'hex scale');
          equal(JSON.parse(fromServer[1]).markers.length, 0, 'every marker gone at the end');

          // a refused simulation throws, as the real call does
          var error = dTest.throws(function() {
            return Meteor.server.method_handlers.saveMarkerGroupInfo.apply(simulation, ['x', '***']);
          });
          equal(error && error.error, 'Name too short.', 'refused in the simulation too');
        });


        // change_username and the coords and minimap settings run as a
        // simulation too. As with the markers: each is sync, and ends where
        // the real calls do, less what only the server does (the alert, the
        // tree job, and refusing a name another player has).
        test('name and settings simulations: each is sync, and ends where the real calls do', function() {
          var user = w.users[0]._id;
          var me = w.players[0]._id;
          var simulation = {userId: user, isSimulation: true, connection: null, unblock: function() {}, setUserId: function() {}};
          var simulate = function(name, args) {
            var returned = Meteor.server.method_handlers[name].apply(simulation, args);
            assert(!dTest.isPromise(returned), name + ': the simulation is sync');
            equal(returned, undefined, name + ' simulation returns nothing');
          };
          var real = function(name, args) {
            dTest.ddp.resetRateLimits();
            equal(clients[0].call.apply(null, [name].concat(args)), undefined, name + ' returns nothing');
          };
          var rooms = [];
          var village = null;
          var state = function() {
            return JSON.stringify({
              player: _.pick(w.player(0), 'username', 'sp_show_coords', 'sp_show_minimap'),
              castle: w.castle(0).username,
              village: Villages.findOne(village._id).username,
              armies: Armies.find({playerId: me}).map(function(a) { return a.username; }),
              rooms: rooms.map(function(id) { var r = Rooms.findOne(id); return [r.name, r.memberData]; })
            });
          };
          var reset = function() {
            Players.update(me, {$set: {username: usernames[0], sp_show_coords: false, sp_show_minimap: true}});
            Castles.update({playerId: me}, {$set: {username: usernames[0]}});
            Villages.update(village._id, {$set: {username: usernames[0]}});
            Armies.update({playerId: me}, {$set: {username: usernames[0]}}, {multi: true});
            Rooms.update(rooms[0], {$set: {name: 'King ' + usernames[0] + ' and Vassals'}});
            Rooms.update({_id: {$in: rooms}}, {$set: {memberData: [{_id: me, username: usernames[0]}, {_id: w.players[1]._id, username: usernames[1]}]}}, {multi: true});
          };
          var name = 'Sim name ' + Random.id(4).replace(/[^a-zA-Z0-9]/g, 'x');

          var play = function(call) {
            reset();
            call('show_coords', [me]);
            call('hide_minimap', [me]);
            var flags = state();
            call('change_username', [me, '  ' + name + '%%']);
            var renamed = state();
            call('hide_coords', [me]);
            call('show_minimap', [me]);
            return [flags, renamed, state()];
          };

          try {
            Rooms.remove({gameId: w.gameId, owner: me, type: 'king'});
            rooms.push(Rooms.insert({gameId: w.gameId, type: 'king', owner: me, name: 'x', members: [me, w.players[1]._id], admins: [], memberData: []}));
            rooms.push(Rooms.insert({gameId: w.gameId, type: 'normal', owner: w.players[1]._id, name: 'Chat', members: [me, w.players[1]._id], admins: [], memberData: []}));
            var at = w.freeHex();
            village = {_id: Villages.insert(_.extend({gameId: w.gameId, x: at.x, y: at.y, playerId: me, user_id: user, username: usernames[0],
              name: 'Simville', level: 1, under_construction: false, created_at: new Date()}, dTest.soldierCounts({})))};
            w.makeArmy(0, {footmen: 1});

            // the tree job the rename adds is recorded, not run, so it can't change the rooms
            var fromServer, fromSimulations;
            var jobs = dTest.recordJobs(function() {
              fromServer = play(real);
              fromSimulations = play(simulate);
            });
            equal(_.pluck(jobs, 'name').join(), 'generateTree', 'the real rename adds the tree job; the simulation adds none');
            equal(fromSimulations[0], fromServer[0], 'after showing the coords and hiding the minimap');
            equal(fromSimulations[1], fromServer[1], 'after changing the name');
            equal(fromSimulations[2], fromServer[2], 'after hiding the coords and showing the minimap');
            var renamed = JSON.parse(fromServer[1]);
            equal(JSON.stringify([renamed.player, renamed.castle, renamed.village, renamed.armies, renamed.rooms[0][0], renamed.rooms[1][1][0].username]),
              JSON.stringify([{username: name, sp_show_coords: true, sp_show_minimap: false}, name, name, [name], 'King ' + name + ' and Vassals', name]),
              'the name is copied everywhere');

            // a refused simulation throws, as the real call does
            reset();
            [[me, 'ab'], [me, 'Danimal'], [me, usernames[0]], [w.players[1]._id, 'Someone Else']].forEach(function(args) {
              var fromSimulation = dTest.throws(function() { return simulate('change_username', args); });
              var fromReal = dTest.throws(function() { return real('change_username', args); });
              assert(fromReal, JSON.stringify(args) + ' is refused');
              equal(fromSimulation && fromSimulation.error, fromReal && fromReal.error, JSON.stringify(args) + ': refused the same way');
            });
            // only the server knows every player's name
            equal(dTest.throws(function() { return real('change_username', [me, usernames[1]]); }).error,
              'A player exists with this username, try another.', 'a taken name is refused by the server');
            equal(dTest.throws(function() { return simulate('change_username', [me, usernames[1]]); }), null, 'but not by the simulation');
          } finally {
            reset();
            Rooms.remove({_id: {$in: rooms}});
            if (village) Villages.remove(village._id);
          }
        });


        // --- deleteGameAccount (last: it removes player 2) ---

        test('deleteGameAccount: you leave the game, with your castle and armies', function() {
          var army = w.makeArmy(2, {footmen: 1});
          var castleXY = {x: w.castle(2).x, y: w.castle(2).y};
          equal(clients[2].call('deleteGameAccount', w.gameId), undefined, 'returns nothing');
          // the job is added without waiting, so wait for its effect, then for what it queued
          assert(dTest.waitFor(function() { return !Players.findOne(w.players[2]._id); }, 30000), 'player removed');
          dTest.waitForJobs(30000);
          equal(Castles.find(w.castles[2]._id).count(), 0, 'castle removed');
          equal(Armies.find(army._id).count(), 0, 'army removed');
          equal(Hexes.findOne({gameId: w.gameId, x: castleXY.x, y: castleXY.y}).hasBuilding, false, 'castle hex is free');
          assert(GlobalAlerts.findOne({gameId: w.gameId, type: 'ga_accountDeleted'}), 'a global alert is made');
          assert(Meteor.users.findOne(w.users[2]._id), 'the user account stays');
          expectError(function() { return clients[2].call('deleteGameAccount', w.gameId); }, 'not-authorized', null, 'no longer a player');
        });

      } finally {
        clients.forEach(function(client) { client.close(); });
        dTest.waitForJobs();
        w.cleanup();
        dTest.ddp.resetRateLimits();
      }
    });
  });
}
