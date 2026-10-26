// The functions that make alerts (packages/dominus-alerts/lib/server, upgrade
// PR 18, Oct 2026): each writes one Alerts doc for the players it names, or
// one GlobalAlerts doc for the game, with its vars. Every caller waits for it,
// so the alert is there by the time the function returns, or its promise
// resolves. A bad argument throws (or rejects) and writes nothing.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the same rule
// applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    dTest.addSuite('alerts (server/alertTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;

      var G = 'alertTestGame';
      var army = {footmen: 2, archers: 1};

      var cleanUp = async function() {
        await Alerts.removeAsync({gameId: G});
        await GlobalAlerts.removeAsync({gameId: G});
      };

      var test = async function(name, fn) {
        await run(name, async function() {
          await cleanUp();
          try {
            return await fn();
          } finally {
            await cleanUp();
          }
        });
      };

      // [function, arguments after gameId, type, players it goes to, vars]
      var ALERTS = [
        ['alert_battleStart', ['p1', 'u1', 'castle', 'b1'], 'alert_battleStart', ['p1'], {unit_id: 'u1', type: 'castle', battle_id: 'b1'}],
        ['alert_receivedGoldFrom', ['p1', 'p2', 100, 5], 'alert_receivedGoldFrom', ['p1'], {fromPlayerId: 'p2', amount: 100, tax: 5}],
        ['alert_receivedArmy', ['p1', 'p2', army], 'alert_receivedArmy', ['p1'], {fromPlayerId: 'p2', army: army}],
        ['alert_addedToChatroom', ['p1', 'p2', 'r1'], 'alert_addedToChatroom', ['p1'], {addedByPlayerId: 'p2', room_id: 'r1'}],
        ['alert_kickedFromChatroom', ['p1', 'r1'], 'alert_kickedFromChatroom', ['p1'], {room_id: 'r1'}],
        ['alert_chatroomMadeAdmin', ['p1', 'r1'], 'alert_chatroomMadeAdmin', ['p1'], {room_id: 'r1'}],
        ['alert_chatroomRemovedFromAdmin', ['p1', 'r1'], 'alert_chatroomRemovedFromAdmin', ['p1'], {room_id: 'r1'}],
        ['alert_chatroomNowOwner', ['p1', 'r1'], 'alert_chatroomNowOwner', ['p1'], {room_id: 'r1'}],
        ['alert_vassalIsUnderAttack', [['p3', 'p4'], 'p1', 'b1'], 'alert_vassalIsUnderAttack', ['p3', 'p4'], {vassalPlayerId: 'p1', battle_id: 'b1'}],
        ['alert_armyFinishedAllMoves', ['p1', 'a1', 3, -2, null, 'v1', null], 'alert_armyFinishedAllMoves', ['p1'],
          {army_id: 'a1', x: 3, y: -2, joinedCastle: null, joinedVillage: 'v1', joinedArmy: null}],
        ['alert_villageDestroyed', ['p1', 'b1', 'Mill'], 'alert_villageDestroyed', ['p1'], {battle_id: 'b1', villageName: 'Mill'}],
        ['alert_armyDestroyed', ['p1', 'b1', 'Guard'], 'alert_armyDestroyed', ['p1'], {battle_id: 'b1', armyName: 'Guard'}],
        ['alert_lostVassal', ['p1', 'p2', 'p3'], 'alert_lostVassal', ['p1'], {lostVassalPlayerId: 'p2', vassalsNewLordPlayerId: 'p3'}],
        ['alert_lostCapital', ['p1', 'c1'], 'alert_lostCapital', ['p1'], {capitalId: 'c1'}],
        ['alert_gainedVassal', ['p1', 'p2', 'p3'], 'alert_gainedVassal', ['p1'], {newVassalPlayerId: 'p2', vassalsNewLordPlayerId: 'p3'}],
        ['alert_capturedCapital', ['p1', 'c1'], 'alert_capturedCapital', ['p1'], {capital_id: 'c1'}],
        ['alert_newLord', ['p1', 'p2'], 'alert_newLord', ['p1'], {lordPlayerId: 'p2'}],
        ['alert_newKingChatroom', ['p1'], 'alert_newKingChatroom', ['p1'], {}],
        ['alert_noLongerDominus', ['p1'], 'alert_noLongerDominus', ['p1'], {}],
        ['alert_noLongerDominusNewUser', ['p1'], 'alert_noLongerDominusNewUser', ['p1'], {}],
        ['alert_youAreDominus', ['p1'], 'alert_youAreDominus', ['p1'], {}]
      ];

      // [function, arguments after gameId, type, vars]
      var GLOBAL_ALERTS = [
        ['gAlert_nameChange', ['p1', 'Old', 'New'], 'ga_nameChange', {playerId: 'p1', previousName: 'Old', newName: 'New'}],
        ['gAlert_sentGold', ['p1', 'p2', 100, 5], 'ga_sentGold', {fromPlayerId: 'p1', toPlayerId: 'p2', amount: 100, tax: 5}],
        ['gAlert_sentArmy', ['p1', 'p2', army], 'ga_sentArmy', {fromPlayerId: 'p1', toPlayerId: 'p2', army: army}],
        ['gAlert_mapExpanded', [40, 2, 5, -5], 'ga_mapExpanded', {numHexes: 40, numCountries: 2, x: 5, y: -5}],
        ['gAlert_noLongerDominusNewUser', ['p1'], 'ga_noLongerDominusNewUser', {oldDominusPlayerId: 'p1'}],
        ['gAlert_newDominus', ['p1', null], 'ga_newDominus', {newDominusPlayerId: 'p1', previousDominusPlayerId: null}],
        ['gAlert_gameOver', ['p1'], 'ga_gameOver', {winnerPlayerId: 'p1'}],
        ['gAlert_accountDeleted', ['someone'], 'ga_accountDeleted', {username: 'someone'}],
        ['gAlert_inactiveAccountDeleted', ['someone'], 'ga_inactiveAccountDeleted', {username: 'someone'}]
      ];

      var call = async function(name, args) {
        return await dAlerts[name].apply(dAlerts, [G].concat(args));
      };

      await test('alerts: every player alert is written, with its players unread and its vars, once the call returns', async function() {
        equal(_.keys(dAlerts).filter(function(k) { return /^alert_/.test(k); }).sort().join(),
          _.pluck(ALERTS, 0).sort().join(), 'the table has every player alert');
        await dTest.eachAsync(ALERTS, async function(row) {
          var before = dClock.now();
          equal(await call(row[0], row[1]), undefined, row[0] + ' returns nothing');
          var docs = await Alerts.find({gameId: G, type: row[2]}).fetchAsync();
          equal(docs.length, 1, row[0] + ': one alert');
          var doc = docs[0] || {};
          equal(JSON.stringify(doc.playerIds), JSON.stringify(row[3].map(function(p) { return {playerId: p, read: false}; })), row[0] + ': its players, unread');
          equal(JSON.stringify(doc.vars), JSON.stringify(row[4]), row[0] + ': its vars');
          assert(doc.created_at instanceof Date && doc.created_at.getTime() >= before.getTime(), row[0] + ': created now');
          await Alerts.removeAsync({gameId: G});
        });
        equal(await GlobalAlerts.find({gameId: G}).countAsync(), 0, 'no global alert');
      });

      await test('alerts: every global alert is written, with its vars, once the call returns', async function() {
        // gAlert_playerReported: see the known bug below
        equal(_.keys(dAlerts).filter(function(k) { return /^gAlert_/.test(k); }).sort().join(),
          _.pluck(GLOBAL_ALERTS, 0).concat(['gAlert_playerReported']).sort().join(), 'the table has every other global alert');
        await dTest.eachAsync(GLOBAL_ALERTS, async function(row) {
          equal(await call(row[0], row[1]), undefined, row[0] + ' returns nothing');
          var docs = await GlobalAlerts.find({gameId: G, type: row[2]}).fetchAsync();
          equal(docs.length, 1, row[0] + ': one alert');
          var doc = docs[0] || {};
          equal(JSON.stringify(_.keys(doc).sort()), JSON.stringify(['_id', 'created_at', 'gameId', 'type', 'vars']), row[0] + ': its fields');
          equal(JSON.stringify(doc.vars), JSON.stringify(row[3]), row[0] + ': its vars');
          await GlobalAlerts.removeAsync({gameId: G});
        });
        equal(await Alerts.find({gameId: G}).countAsync(), 0, 'no player alert');
      });

      await test('alerts: a bad argument throws or rejects, and writes nothing', async function() {
        var bad = [
          ['alert_battleStart', [5, 'u1', 'castle', 'b1']],
          ['alert_receivedGoldFrom', ['p1', 'p2', 'lots', 5]],
          ['alert_vassalIsUnderAttack', ['p3', 'p1', 'b1']],
          ['alert_armyFinishedAllMoves', ['p1', 'a1', 1.5, 0, null, null, null]],
          ['gAlert_mapExpanded', [1.5, 2, 0, 0]],
          ['gAlert_newDominus', ['p1', 7]]
        ];
        await dTest.eachAsync(bad, async function(row) {
          var e = await dTest.throws(function() { return dAlerts[row[0]].apply(dAlerts, [G].concat(row[1])); });
          assert(e && /Match error/.test(e.message), row[0] + ' refused: ' + (e && e.message));
        });
        var e = await dTest.throws(function() { return dAlerts.alert_newLord(null, 'p1', 'p2'); });
        assert(e && /Match error/.test(e.message), 'no gameId: ' + (e && e.message));
        equal(await Alerts.find({gameId: G}).countAsync() + await GlobalAlerts.find({gameId: G}).countAsync(), 0, 'nothing written');
      });

      await test('alerts: gAlert_playerReported always fails, as reporterUsername is never defined (known bug)', async function() {
        var e = await dTest.throws(function() { return dAlerts.gAlert_playerReported(G, 'p1', 'someone', 'spam', 'p2', 'other'); });
        assert(e && /reporterUsername is not defined/.test(e.message), 'ReferenceError: ' + (e && e.message));
        equal(await GlobalAlerts.find({gameId: G}).countAsync(), 0, 'nothing written');
      });
    });
  });
}
