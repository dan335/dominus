// Job tests: relations, chatrooms, game end and close, stats (Oct 2026).
//
// Same approach as server/armyJobTests.js: each queue job's handler is run
// directly (dTest.runJob) in a real started game, and the jobs it adds are
// recorded rather than run (dTest.recordJobs). The tests describe what the
// jobs do today. A test named "known bug" describes a bug in today's code;
// fixing the bug means changing that test on purpose.
//
// Nothing here sends mail or touches S3: sendGameStartedEmail runs with
// Email.send and Email.sendAsync replaced, and checkForGameClose with
// Mapbaker.deleteS3BakesForGame replaced.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    dTest.addSuite('jobs: relations, chat and game end (server/gameJobTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var runJob = dTest.runJob;

      if (process.env.DOMINUS_WORKER != 'true') {
        await run('game jobs: need the worker', function() { return 'skip'; });
        return;
      }

      var w = await dTest.buildGameWorld({players: 3});
      var ids = _.pluck(w.players, '_id');

      // the relation fields as the world started, put back after each test
      var relationFields = ['lord', 'king', 'is_king', 'allies_above', 'allies_below', 'team', 'vassals', 'is_dominus',
        'num_team', 'num_vassals', 'num_allies_above', 'num_allies_below'];
      var startRelations = await dTest.mapAsync(w.players, async function(p) { return _.pick(await Players.findOneAsync(p._id), relationFields); });
      async function restoreRelations() {
        await dTest.eachAsync(startRelations, async function(fields, i) {
          var unset = {};
          _.difference(relationFields, _.keys(fields)).forEach(function(field) { unset[field] = ''; });
          await Players.updateAsync(ids[i], _.isEmpty(unset) ? {$set: fields} : {$set: fields, $unset: unset});
        });
      }

      function sorted(list) {
        return JSON.stringify(_.sortBy(list || [], _.identity));
      }

      // lord takes vassal, the way a battle does, with its follow-up jobs recorded
      function conquer(lord, vassal) {
        return dTest.recordJobs(async function() {
          await dInit.set_lord_and_vassal(ids[lord], ids[vassal]);
        });
      }

      async function kingRoom(i) {
        return await Rooms.findOneAsync({gameId: w.gameId, owner: ids[i], type: 'king'});
      }

      async function alertsOf(type, playerId) {
        return await Alerts.find({gameId: w.gameId, type: type, 'playerIds.playerId': playerId}).countAsync();
      }

      // an army for player i that runs none of its jobs
      async function quietArmy(i, soldiers, at) {
        var army;
        await dTest.recordJobs(async function() { army = await w.makeArmy(i, soldiers, at); });
        return army;
      }

      var test = dTest.contractTest(run, async function() {
        await w.removeArmies();
        await Rooms.removeAsync({gameId: w.gameId});
        await Roomchats.removeAsync({gameId: w.gameId});
        await Alerts.removeAsync({gameId: w.gameId});
        await GlobalAlerts.removeAsync({gameId: w.gameId});
        await Gamestats.removeAsync({gameId: w.gameId});
        await Dailystats.removeAsync({gameId: w.gameId});
        await Villages.find({gameId: w.gameId}).forEachAsync(async function(v) {
          await Villages.removeAsync(v._id);
          await Mapmaker.buildingRemoved(w.gameId, v.x, v.y);
        });
        await restoreRelations();
      });


      try {

        // --- set_lord_and_vassal and its jobs ---

        await test('set_lord_and_vassal: makes the lord and vassal and queues the jobs that follow a conquest', async function() {
          var jobs = await conquer(0, 1);
          var vassal = await w.player(1);
          equal(vassal.lord, ids[0], 'vassal\'s lord');
          equal(vassal.king, ids[0], 'vassal\'s king');
          equal(vassal.is_king, false, 'vassal is no longer a king');
          assert(_.contains((await w.player(0)).allies_below, ids[1]), 'lord has the vassal below it');
          equal((await w.player(0)).king, ids[0], 'the lord is its own king');

          var names = _.uniq(_.pluck(jobs, 'name')).sort();
          ['checkForDominus', 'cleanupAllKingChatrooms', 'destroyKingChatroom', 'enemies_together_check',
            'enemy_on_building_check', 'generateTree', 'updateKingChatroom'].forEach(function(name) {
            assert(_.contains(names, name), name + ' queued (got ' + names.join(', ') + ')');
          });
          equal(dTest.jobsNamed(jobs, 'updateKingChatroom')[0].data.playerId, ids[1], 'updateKingChatroom for the vassal');
          equal(dTest.jobsNamed(jobs, 'destroyKingChatroom')[0].data.king_id, ids[1], 'the vassal\'s king room destroyed, since it was a king');
        });


        // --- king chatrooms ---

        await test('updateKingChatroom: a vassal\'s update makes its king a room with every ally below, once', async function() {
          await conquer(0, 1);
          await runJob('updateKingChatroom', {gameId: w.gameId, playerId: ids[1]});
          var room = await kingRoom(0);
          assert(room, 'the king has a king room');
          equal(room.name, 'King ' + w.players[0].username + ' and Vassals', 'name');
          equal(sorted(room.members), sorted([ids[0], ids[1]]), 'members: king and vassal');
          equal(sorted(_.pluck(room.memberData, '_id')), sorted([ids[0], ids[1]]), 'memberData');
          equal(await alertsOf('alert_newKingChatroom', ids[0]), 1, 'king alerted');

          await conquer(0, 2);
          await runJob('updateKingChatroom', {gameId: w.gameId, playerId: ids[2]});
          equal(await Rooms.find({gameId: w.gameId, type: 'king'}).countAsync(), 1, 'still one room');
          equal(sorted((await kingRoom(0)).members), sorted(ids), 'the new vassal added');
          equal(await alertsOf('alert_newKingChatroom', ids[0]), 1, 'no second alert');
        });

        await test('cleanupAllKingChatrooms: makes the room a king with vassals is missing, through updateKingChatroom for the king', async function() {
          await conquer(0, 1);
          assert(!await kingRoom(0), 'no room yet');
          await runJob('cleanupAllKingChatrooms', {gameId: w.gameId});
          var room = await kingRoom(0);
          assert(room, 'room made');
          equal(sorted(room.members), sorted([ids[0], ids[1]]), 'king and vassal');
          equal(await Rooms.find({gameId: w.gameId, type: 'king'}).countAsync(), 1, 'only that room: kings without vassals get none');
        });

        await test('destroyKingChatroom: removes the player\'s king rooms and their chats, and nothing else', async function() {
          var king = await dChat.createChatroom(w.gameId, 'King room', 'king', ids[0], [ids[0], ids[1]], []);
          var normal = await dChat.createChatroom(w.gameId, 'Normal room', 'normal', ids[0], [ids[0], ids[1]], []);
          var other = await dChat.createChatroom(w.gameId, 'Other king', 'king', ids[2], [ids[2], ids[1]], []);
          await dTest.eachAsync([king, normal, other], async function(room) {
            await Roomchats.insertAsync({gameId: w.gameId, room_id: room, text: 'hi', created_at: new Date()});
          });

          await runJob('destroyKingChatroom', {king_id: ids[0]});
          assert(!await Rooms.findOneAsync(king), 'king room removed');
          equal(await Roomchats.find({room_id: king}).countAsync(), 0, 'its chats removed');
          assert(await Rooms.findOneAsync(normal), 'their normal room stays');
          equal(await Roomchats.find({room_id: normal}).countAsync(), 1, 'with its chat');
          assert(await Rooms.findOneAsync(other), 'another king\'s room stays');
        });

        await test('cleanupAllKingChatrooms: removes rooms of missing owners and of one member, queues removal for non-kings, and fixes names', async function() {
          await conquer(0, 1);
          var gone = await dChat.createChatroom(w.gameId, 'King gone', 'king', 'noSuchPlayer', ['noSuchPlayer', ids[1]], []);
          var lonely = await dChat.createChatroom(w.gameId, 'King lonely', 'king', ids[2], [ids[2]], []);
          var notKing = await dChat.createChatroom(w.gameId, 'King of nothing', 'king', ids[1], [ids[1], ids[2]], []);
          var misnamed = await dChat.createChatroom(w.gameId, 'Wrong name', 'king', ids[0], [ids[0], ids[1]], []);
          await Roomchats.insertAsync({gameId: w.gameId, room_id: gone, text: 'hi', created_at: new Date()});

          var jobs = await dTest.recordJobs(async function() {
            await runJob('cleanupAllKingChatrooms', {gameId: w.gameId});
          });
          assert(!await Rooms.findOneAsync(gone), 'room of a missing owner removed');
          equal(await Roomchats.find({room_id: gone}).countAsync(), 0, 'with its chats');
          assert(!await Rooms.findOneAsync(lonely), 'room with one member removed');
          var destroy = dTest.jobsNamed(jobs, 'destroyKingChatroom');
          equal(destroy.length, 1, 'destroyKingChatroom queued once');
          equal(destroy[0].data.king_id, ids[1], 'for the owner who is no longer a king');
          assert(await Rooms.findOneAsync(notKing), 'that room is left for the queued job');
          equal((await Rooms.findOneAsync(misnamed)).name, 'King ' + w.players[0].username + ' and Vassals', 'renamed after its owner');
        });

        await test('setupEveryoneChatroom: one "everyone" room with every player of the game, updated on later runs', async function() {
          await runJob('setupEveryoneChatroom', {gameId: w.gameId});
          var rooms = await Rooms.find({gameId: w.gameId, type: 'everyone'}).fetchAsync();
          equal(rooms.length, 1, 'one room');
          equal(rooms[0].name, 'Everyone', 'name');
          equal(rooms[0].owner, null, 'no owner');
          equal(sorted(rooms[0].members), sorted(ids), 'every player');

          var extra = await Players.insertAsync({gameId: w.gameId, userId: 'u_' + Random.id(5), username: 'late_' + Random.id(4)});
          try {
            await runJob('setupEveryoneChatroom', {gameId: w.gameId});
            equal(await Rooms.find({gameId: w.gameId, type: 'everyone'}).countAsync(), 1, 'still one room');
            assert(_.contains((await Rooms.findOneAsync(rooms[0]._id)).members, extra), 'the new player added');
          } finally {
            await Players.removeAsync(extra);
          }
        });


        // --- enemy_on_building_check, enemies_together_check ---

        await test('enemy_on_building_check: an enemy army on a castle or village queues its battle, a vassal on its own lord\'s village does not', async function() {
          await conquer(0, 1);
          var castle = await w.castle(2);
          await quietArmy(0, {footmen: 3}, castle);
          var village = await Villages.insertAsync(_.extend({gameId: w.gameId, playerId: ids[0], user_id: w.users[0]._id, x: 0, y: 0,
            level: 1, under_construction: false}, await w.freeHex(), dTest.soldierCounts({})));
          var v = await Villages.findOneAsync(village);
          await quietArmy(1, {footmen: 3}, v);

          var jobs = await dTest.recordJobs(async function() {
            await runJob('enemy_on_building_check', {gameId: w.gameId});
          });
          var battles = dTest.jobsNamed(jobs, 'runBattle');
          equal(battles.length, 1, 'one battle');
          equal(battles[0].uniqueId, w.gameId + '_' + castle.x + '_' + castle.y, 'at the enemy castle');
        });

        await test('enemy_on_building_check: a vassal\'s army on its lord\'s castle attacks it, unless that would loop', async function() {
          await conquer(0, 1);
          var lordCastle = await w.castle(0);
          var vassalCastle = await w.castle(1);
          var army = await quietArmy(1, {footmen: 3}, lordCastle);
          var jobs = await dTest.recordJobs(async function() {
            await runJob('enemy_on_building_check', {gameId: w.gameId});
          });
          equal(dTest.jobsNamed(jobs, 'runBattle').length, 1, 'battle at the lord\'s castle');

          // the lord also has an army on the vassal's castle: capturing would go back and forth
          await quietArmy(0, {footmen: 3}, vassalCastle);
          jobs = await dTest.recordJobs(async function() {
            await runJob('enemy_on_building_check', {gameId: w.gameId});
          });
          equal(dTest.jobsNamed(jobs, 'runBattle').length, 0, 'no battle when it would loop');
          assert(await dInit.attackCreatesLoop(w.gameId, lordCastle.x, lordCastle.y), 'attackCreatesLoop says so');
          assert(await Armies.findOneAsync(army._id), 'army still there');
        });

        await test('enemies_together_check: enemies on one hex fight, a lord and vassal don\'t, unless one is dominus', async function() {
          await conquer(0, 1);
          var hex = await w.freeHex();
          var spot = await w.freeHex([hex]);
          await quietArmy(0, {footmen: 3}, hex);
          await quietArmy(1, {footmen: 3}, hex);
          await quietArmy(0, {footmen: 3}, spot);
          await quietArmy(2, {footmen: 3}, spot);

          var jobs = await dTest.recordJobs(async function() {
            await runJob('enemies_together_check', {gameId: w.gameId});
          });
          var battles = _.uniq(_.pluck(dTest.jobsNamed(jobs, 'runBattle'), 'uniqueId'));
          equal(JSON.stringify(battles), JSON.stringify([w.gameId + '_' + spot.x + '_' + spot.y]), 'only the enemies\' hex');

          await Players.updateAsync(ids[0], {$set: {is_dominus: true}});
          jobs = await dTest.recordJobs(async function() {
            await runJob('enemies_together_check', {gameId: w.gameId});
          });
          battles = _.uniq(_.pluck(dTest.jobsNamed(jobs, 'runBattle'), 'uniqueId'));
          assert(_.contains(battles, w.gameId + '_' + hex.x + '_' + hex.y), 'dominus fights its own vassal');
        });


        // --- removeDominus, generateTree ---

        await test('removeDominus: the dominus loses the title and both alerts go out; with no dominus nothing happens', async function() {
          await Players.updateAsync(ids[2], {$set: {is_dominus: true}});
          await runJob('removeDominus', {gameId: w.gameId});
          equal((await w.player(2)).is_dominus, false, 'no longer dominus');
          equal(await alertsOf('alert_noLongerDominusNewUser', ids[2]), 1, 'player alerted');
          equal(await GlobalAlerts.find({gameId: w.gameId, type: 'ga_noLongerDominusNewUser'}).countAsync(), 1, 'everyone alerted');

          await runJob('removeDominus', {gameId: w.gameId});
          equal(await GlobalAlerts.find({gameId: w.gameId}).countAsync(), 1, 'no second alert');
        });

        await test('generateTree: the game\'s tree lists each king by name with its vassals nested below', async function() {
          await conquer(0, 1);
          await conquer(1, 2);
          await runJob('generateTree', {gameId: w.gameId});
          var tree = (await Games.findOneAsync(w.gameId)).tree;
          equal(tree.length, 1, 'one king');
          equal(tree[0]._id, ids[0], 'player 0 at the top');
          equal(tree[0].vassals.length, 1, 'one vassal');
          equal(tree[0].vassals[0]._id, ids[1], 'player 1');
          equal(tree[0].vassals[0].vassals[0]._id, ids[2], 'player 2 below player 1');
          equal(tree[0].username, w.players[0].username, 'with names');

          await restoreRelations();
          await runJob('generateTree', {gameId: w.gameId});
          tree = (await Games.findOneAsync(w.gameId)).tree;
          equal(JSON.stringify(_.pluck(tree, 'username')), JSON.stringify(_.sortBy(_.pluck(w.players, 'username'), _.identity)), 'three kings, by name');
        });


        // --- stats ---

        await test('gamestats_job: known bug: each run adds a Gamestats doc, since the period it upserts into ends before it begins', async function() {
          // gamestatsEnd adds the undefined _s.init.statsInverval to the start of
          // the 6 hour dailystats period, so the range is always empty
          assert(_s.init.gamestatsEnd() <= _s.init.gamestatsBegin(), 'period ends at or before its start');
          await runJob('gamestats_job', {gameId: w.gameId});
          await runJob('gamestats_job', {gameId: w.gameId});
          var docs = await Gamestats.find({gameId: w.gameId}).fetchAsync();
          equal(docs.length, 2, 'two docs, not one for the period');
          equal(docs[1].num_users, 3, 'num_users');
          _s.armies.types.forEach(function(type) {
            var one = dTest.soldierCounts({});
            one[type] = 1;
            equal(docs[1].soldierWorth[type], dArmies.worth(w.gameId, one), type + ' worth');
          });
        });

        await test('initDailystatsForNewUser: a zeroed Dailystats doc ranked last among the game\'s players', async function() {
          await Games.updateAsync(w.gameId, {$set: {numPlayers: 7}});
          await runJob('initDailystatsForNewUser', {gameId: w.gameId, userId: w.users[0]._id, playerId: ids[0]});
          var doc = await Dailystats.findOneAsync({playerId: ids[0]});
          assert(doc, 'inserted');
          equal(doc.incomeRank, 7, 'incomeRank is numPlayers');
          equal(doc.user_id, w.users[0]._id, 'user_id');
          equal(doc.numVassals, 0, 'numVassals');
          equal(doc.inc.gold, 0, 'inc.gold');
        });

        await test('generateTree: a lord\'s vassals are listed by name', async function() {
          await conquer(0, 2);
          await conquer(0, 1);
          await runJob('generateTree', {gameId: w.gameId});
          var tree = (await Games.findOneAsync(w.gameId)).tree;
          equal(tree.length, 1, 'one king');
          equal(JSON.stringify(_.pluck(tree[0].vassals, 'username')),
            JSON.stringify(_.sortBy([w.players[1].username, w.players[2].username], _.identity)), 'both vassals, by name');
          equal(JSON.stringify(_.pluck(tree[0].vassals, 'vassals')), '[[],[]]', 'with no vassals of their own');
          await restoreRelations();
        });


        // --- updateOverallPlayerRankings ---

        await test('updateOverallPlayerRankings: wins, games and points from ended games, regular and pro kept apart', async function() {
          var users = await dTest.mapAsync(_.range(3), async function() { return await t.createTestUser(); });
          var a = users[0]._id, b = users[1]._id, c = users[2]._id;
          var results = function(numVassals, income) {
            return {numVassals: numVassals, income: income};
          };
          var games = [
            // regular: a won, a is 1st by vassals and 3rd by income, b 2nd and 1st
            await t.createTestGame({name: 'Rankings Regular', hasEnded: true,
              results: results([{userId: a, rank: 1}, {userId: b, rank: 2}], [{userId: b, rank: 1}, {userId: a, rank: 3}])}),
            // pro: c is 1st by both
            await t.createTestGame({name: 'Rankings Pro', hasEnded: true, isProOnly: true,
              results: results([{userId: c, rank: 1}], [{userId: c, rank: 1}])}),
            // not ended, and crazy fast: neither counts
            await t.createTestGame({name: 'Rankings Running'}),
            await t.createTestGame({name: 'Rankings Crazy', hasEnded: true, isCrazyFast: true,
              results: results([{userId: b, rank: 1}], [{userId: b, rank: 1}])})
          ];
          var gameIds = _.pluck(games, '_id');
          var join = async function(game, userId, won) {
            await Players.insertAsync({gameId: gameIds[game], userId: userId, username: 'rankings', wonGame: won});
          };
          await join(0, a, true);
          await join(0, b, false);
          await join(1, c, false);
          await join(2, a, true);
          await join(3, b, true);
          // a rank 1 is 110 points, 2 is 89, 3 is 78
          try {
            await runJob('updateOverallPlayerRankings', {});
            var ranking = async function(userId, kind) { return (await Meteor.users.findOneAsync(userId))[kind]; };
            var fields = function(r) { return [r.numGames, r.wins, r.numVassalsPoints, r.incomePoints, r.overallPoints].join(','); };
            equal(fields(await ranking(a, 'rankingRegular')), '1,1,110,78,688', 'a regular: one game, a win, 500 + 110 + 78 points');
            equal(fields(await ranking(b, 'rankingRegular')), '1,0,89,110,199', 'b regular: the crazy fast win doesn\'t count');
            equal(fields(await ranking(c, 'rankingPro')), '1,0,110,110,220', 'c pro');
            equal(fields(await ranking(a, 'rankingPro')), '0,0,0,0,0', 'a has no pro games');
            equal(fields(await ranking(c, 'rankingRegular')), '0,0,0,0,0', 'c has no regular games');

            // ranks: one more than the number of users with more points
            var rankOf = async function(userId, kind, field) {
              var points = (await ranking(userId, kind))[field + 'Points'];
              var above = {};
              above[kind + '.' + field + 'Points'] = {$gt: points};
              var tied = {};
              tied[kind + '.' + field + 'Points'] = points;
              var rank = (await ranking(userId, kind))[field + 'Rank'];
              var lowest = await Meteor.users.find(above).countAsync() + 1;
              assert(rank >= lowest && rank < lowest + await Meteor.users.find(tied).countAsync(),
                userId + ' ' + kind + ' ' + field + 'Rank ' + rank + ', expected from ' + lowest);
              return rank;
            };
            assert(await rankOf(a, 'rankingRegular', 'numVassals') < await rankOf(b, 'rankingRegular', 'numVassals'), 'a above b by vassals');
            assert(await rankOf(b, 'rankingRegular', 'income') < await rankOf(a, 'rankingRegular', 'income'), 'b above a by income');
            assert(await rankOf(a, 'rankingRegular', 'overall') < await rankOf(b, 'rankingRegular', 'overall'), 'a above b overall');
            await dTest.eachAsync(['numVassals', 'income', 'overall'], async function(field) { await rankOf(c, 'rankingPro', field); });
            equal((await ranking(a, 'rankingPro')).overallRank, 0, 'no pro points, no pro rank');

            // run again: the same, not doubled
            await runJob('updateOverallPlayerRankings', {});
            equal(fields(await ranking(a, 'rankingRegular')), '1,1,110,78,688', 'a regular after a second run');
          } finally {
            await dTest.eachAsync(gameIds, async function(id) { await Players.removeAsync({gameId: id}); await Games.removeAsync(id); });
            await dTest.eachAsync(users, async function(user) { await t.cleanupUser(user._id); });
          }
        });


        // --- sendGameStartedEmail (Email.sendAsync replaced) ---

        await test('sendGameStartedEmail: emails a link to the game to a user with an address, and nobody without one', async function() {
          var sent = [];
          // the job sends with Email.sendAsync since upgrade PR 15; Email.send
          // is replaced too, so a send through either never leaves the test
          var send = Email.send;
          var sendAsync = Email.sendAsync;
          Email.send = function(options) { sent.push(options); };
          Email.sendAsync = async function(options) { sent.push(options); };
          var withEmail = await t.createTestUser({emails: [{address: 'started_' + Random.id(4).toLowerCase() + '@example.com', verified: true}]});
          var without = await t.createTestUser();
          try {
            await runJob('sendGameStartedEmail', {gameId: w.gameId, gameName: 'Test World', userId: withEmail._id});
            await runJob('sendGameStartedEmail', {gameId: w.gameId, gameName: 'Test World', userId: without._id});
            await runJob('sendGameStartedEmail', {gameId: w.gameId, gameName: 'Test World', userId: 'noSuchUser'});
          } finally {
            Email.send = send;
            Email.sendAsync = sendAsync;
            await Meteor.users.removeAsync({_id: {$in: [withEmail._id, without._id]}});
          }
          equal(sent.length, 1, 'one email');
          assert(sent[0].to.indexOf(withEmail.emails[0].address) != -1, 'to the user');
          equal(sent[0].subject, 'Game Started', 'subject');
          assert(sent[0].html.indexOf('/game/' + w.gameId) != -1, 'links to the game');
        });

      } finally {
        await w.cleanup();
      }
    });


    // A game of its own, since ending and closing it removes the game's documents.
    dTest.addSuite('jobs: game end and close (server/gameJobTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var runJob = dTest.runJob;

      if (process.env.DOMINUS_WORKER != 'true') {
        await run('game end jobs: need the worker', function() { return 'skip'; });
        return;
      }

      async function endedGame(fields) {
        var game = await t.createTestGame(_.extend({name: 'Ending ' + Random.id(4), hasStarted: true, isStarting: true,
          startedAt: new Date()}, fields));
        var users = await dTest.mapAsync([0, 1, 2], async function() {
          return await t.createTestUser({emails: [{address: 'end_' + Random.id(5).toLowerCase() + '@example.com', verified: true}]});
        });
        var players = await dTest.mapAsync(users, async function(user, i) {
          return await Players.insertAsync({gameId: game._id, userId: user._id, username: user.username, x: i, y: 0,
            castle_id: 'castle' + i, income: 100 * (i + 1), num_allies_below: 2 - i, losses_worth: i, losses_num: i,
            is_dominus: false, allies_above: [], allies_below: []});
        });
        return {game: game, users: users, players: players};
      }

      async function cleanup(g) {
        await t.cleanup(g.game._id);
        await dTest.eachAsync(dTest.gameCollections(), async function(collection) { await collection.removeAsync({gameId: g.game._id}); });
        await dTest.eachAsync(g.users, async function(user) { await Meteor.users.removeAsync(user._id); });
      }

      // the game the start job would pick: the only one waiting whose start time came
      async function startingGame(fields) {
        var game = await t.createTestGame(_.extend({name: 'Starting ' + Random.id(4), hasStarted: false, isStarting: false,
          startAt: moment().subtract(1, 'minute').toDate()}, fields));
        var waiting = await Games.find({hasStarted: false, isStarting: false, startAt: {$lte: new Date()}}, {fields: {name: 1}}).fetchAsync();
        equal(JSON.stringify(_.pluck(waiting, '_id')), JSON.stringify([game._id]), 'no other game waits to start: ' + _.pluck(waiting, 'name').join(', '));
        return game;
      }

      await run('checkForGameStart: a game past its start time starts: a player for each signup, its market, and the start jobs', async function() {
        var game = await startingGame();
        var user = await t.createTestUser({emails: [{address: 'start_' + Random.id(5).toLowerCase() + '@example.com', verified: true}]});
        var g = {game: game, users: [user]};
        var sizes = _.pick(_s.mapmaker, 'minHexesInCountry', 'maxHexesInCountry');
        try {
          await Gamesignups.insertAsync({gameId: game._id, userId: user._id, username: user.username, createdAt: new Date(), usedToken: false});
          await Mapmaker.eraseMap(game._id);
          _s.mapmaker.minHexesInCountry = 100;
          _s.mapmaker.maxHexesInCountry = 100;
          await Mapmaker.addCountry(game._id, true);
          _.extend(_s.mapmaker, sizes);

          var jobs = await dTest.recordJobs(async function() {
            await runJob('checkForGameStart', {});
          });

          var started = await Games.findOneAsync(game._id);
          equal(started.hasStarted, true, 'started');
          assert(started.startedAt, 'startedAt set');
          equal(started.taxesCollected, 0, 'no taxes yet');
          var player = await Players.findOneAsync({gameId: game._id, userId: user._id});
          assert(player && player.castle_id, 'the signup has a player and a castle');
          equal(await Market.find({gameId: game._id}).countAsync(), _s.market.types.length, 'a market');
          equal(await Gamesignups.find({gameId: game._id}).countAsync(), 0, 'the signups are gone');
          equal(dTest.jobsNamed(jobs, 'initDailystatsForNewUser').length, 1, 'daily stats for the player');
          equal(dTest.jobsNamed(jobs, 'setupEveryoneChatroom').length, 1, 'the everyone chatroom');
          equal(dTest.jobsNamed(jobs, 'generateTree').length, 1, 'the tree');
          var emails = dTest.jobsNamed(jobs, 'sendGameStartedEmail');
          equal(JSON.stringify(_.map(emails, function(j) { return j.data.userId; })), JSON.stringify([user._id]), 'an email to the player');
        } finally {
          _.extend(_s.mapmaker, sizes);
          await cleanup(g);
        }
      });

      // startGame is async since upgrade PR 15: the job must wait for it to
      // catch its failure
      await run('checkForGameStart: when the start fails, isStarting is put back so a later run tries again', async function() {
        var game = await startingGame();
        var startGame = dManager.startGame;
        var error = null;
        try {
          dManager.startGame = async function() { await Promise.resolve(); throw new Error('planted start failure'); };
          var errors = [];
          var consoleError = console.error;
          console.error = function() { errors.push(_.toArray(arguments)); };
          try {
            error = (await runJob('checkForGameStart', {}, {allowError: true})).error;
          } finally {
            console.error = consoleError;
          }
          assert(error && /planted start failure/.test(error.message), 'the job failed with the start\'s error: ' + (error && error.message));
          assert(_.some(errors, function(e) { return e[0] == 'startGame failed, resetting isStarting'; }), 'and logged it');
          var after = await Games.findOneAsync(game._id);
          equal(after.isStarting, false, 'isStarting put back');
          equal(after.hasStarted, false, 'not started');
        } finally {
          dManager.startGame = startGame;
          await t.cleanup(game._id);
        }
      });

      await run('checkForGameEnd: a game past its end date ends with its dominus the winner, ranked results and a close date', async function() {
        var g = await endedGame({endDate: moment().subtract(1, 'minute').toDate()});
        try {
          await Players.updateAsync(g.players[0], {$set: {is_dominus: true}});
          await Villages.insertAsync({gameId: g.game._id, playerId: g.players[1], user_id: g.users[1]._id, username: g.users[1].username,
            income: {worth: 50}, x: 5, y: 5});
          var jobs = await dTest.recordJobs(async function() {
            await runJob('checkForGameEnd', {});
          });

          var game = await Games.findOneAsync(g.game._id);
          equal(game.hasEnded, true, 'ended');
          equal(game.winningPlayer.playerId, g.players[0], 'the dominus won');
          equal(game.winningPlayer.email, g.users[0].emails[0].address, 'with their email');
          var days = moment(game.closeDate).diff(moment(), 'hours');
          assert(days >= 71 && days <= 72, 'closes in 3 days (' + days + ' hours)');
          equal(JSON.stringify(_.pluck(game.results.income, 'playerId')), JSON.stringify(g.players.slice().reverse()), 'results by income');
          equal(JSON.stringify(_.pluck(game.results.numVassals, 'playerId')), JSON.stringify(g.players), 'results by vassals');
          equal(game.results.villages[0].villageWorth, 50, 'results by village');
          equal(game.results.lostSoldiers[0].playerId, g.players[2], 'results by losses');

          var players = await dTest.mapAsync(g.players, async function(id) { return await Players.findOneAsync(id); });
          equal(players[0].wonGame, true, 'winner wonGame');
          equal(players[1].wonGame, false, 'others did not win');
          assert(_.every(players, function(p) { return p.gameIsOver; }), 'every player gameIsOver');
          assert(await dTest.waitFor(async function() { return (await Players.findOneAsync(g.players[2])).rankByIncome == 1; }, 5000),
            'rankByIncome copied from Dailystats (got ' + (await Players.findOneAsync(g.players[2])).rankByIncome + ')');
          equal(await GlobalAlerts.find({gameId: g.game._id, type: 'ga_gameOver'}).countAsync(), 1, 'game over alert');
          equal(dTest.jobsNamed(jobs, 'updateOverallPlayerRankings').length, 1, 'overall rankings queued');
        } finally {
          await cleanup(g);
        }
      });

      await run('checkForGameEnd: with no dominus to name the winner, the countdown is cleared and the game goes on', async function() {
        var g = await endedGame({endDate: moment().subtract(1, 'minute').toDate(), lastDominusPlayerId: 'noSuchPlayer'});
        try {
          await runJob('checkForGameEnd', {});
          var game = await Games.findOneAsync(g.game._id);
          equal(game.hasEnded, false, 'not ended');
          equal(game.endDate, null, 'endDate cleared');
          equal(game.lastDominusPlayerId, null, 'lastDominusPlayerId cleared');
          assert(!(await Players.findOneAsync(g.players[0])).gameIsOver, 'players not sent to game over');
        } finally {
          await cleanup(g);
        }
      });

      await run('checkForGameClose: a game past its close date is closed: its documents removed, players marked, the game trimmed, S3 bakes deleted', async function() {
        var g = await endedGame({hasEnded: true, closeDate: moment().subtract(1, 'minute').toDate(), tree: [{_id: 'x'}], taxesCollected: 5});
        var deleted = [];
        var deleteBakes = Mapbaker.deleteS3BakesForGame;
        Mapbaker.deleteS3BakesForGame = function(gameId) { deleted.push(gameId); };
        try {
          var gameId = g.game._id;
          await Castles.insertAsync({gameId: gameId, x: 0, y: 0, playerId: g.players[0]});
          await Armies.insertAsync({gameId: gameId, x: 0, y: 0, playerId: g.players[0]});
          await Hexes.insertAsync({gameId: gameId, x: 0, y: 0});
          await Rooms.insertAsync({gameId: gameId, type: 'everyone', members: []});
          await Market.insertAsync({gameId: gameId, type: 'grain', price: 1});

          await runJob('checkForGameClose', {});

          var game = await Games.findOneAsync(gameId);
          equal(game.hasClosed, true, 'closed');
          equal(game.tree, undefined, 'fields outside the kept list removed');
          equal(game.taxesCollected, undefined, 'taxesCollected removed');
          equal(game.name, g.game.name, 'name kept');
          await dTest.eachAsync([Castles, Armies, Hexes, Rooms, Market], async function(collection) {
            equal(await collection.find({gameId: gameId}).countAsync(), 0, collection._name + ' removed');
          });
          assert(await dTest.waitFor(async function() { return await Players.find({gameId: gameId, gameIsClosed: true}).countAsync() == 3; }, 5000),
            'players marked gameIsClosed');
          equal(await Players.find({gameId: gameId}).countAsync(), 3, 'players kept');
          equal(JSON.stringify(deleted), JSON.stringify([gameId]), 'S3 bakes deleted for the game');
        } finally {
          Mapbaker.deleteS3BakesForGame = deleteBakes;
          await cleanup(g);
        }
      });
    });
  });
}
