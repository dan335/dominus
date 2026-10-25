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
    dTest.addSuite('jobs: relations, chat and game end (server/gameJobTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var runJob = dTest.runJob;

      if (process.env.DOMINUS_WORKER != 'true') {
        run('game jobs: need the worker', function() { return 'skip'; });
        return;
      }

      var w = dTest.buildGameWorld({players: 3});
      var ids = _.pluck(w.players, '_id');

      // the relation fields as the world started, put back after each test
      var relationFields = ['lord', 'king', 'is_king', 'allies_above', 'allies_below', 'team', 'vassals', 'is_dominus',
        'num_team', 'num_vassals', 'num_allies_above', 'num_allies_below'];
      var startRelations = w.players.map(function(p) { return _.pick(Players.findOne(p._id), relationFields); });
      function restoreRelations() {
        startRelations.forEach(function(fields, i) {
          var unset = {};
          _.difference(relationFields, _.keys(fields)).forEach(function(field) { unset[field] = ''; });
          Players.update(ids[i], _.isEmpty(unset) ? {$set: fields} : {$set: fields, $unset: unset});
        });
      }

      function sorted(list) {
        return JSON.stringify(_.sortBy(list || [], _.identity));
      }

      // lord takes vassal, the way a battle does, with its follow-up jobs recorded
      function conquer(lord, vassal) {
        return dTest.recordJobs(function() {
          dTest.settle(dInit.set_lord_and_vassal(ids[lord], ids[vassal]));
        });
      }

      function kingRoom(i) {
        return Rooms.findOne({gameId: w.gameId, owner: ids[i], type: 'king'});
      }

      function alertsOf(type, playerId) {
        return Alerts.find({gameId: w.gameId, type: type, 'playerIds.playerId': playerId}).count();
      }

      // an army for player i that runs none of its jobs
      function quietArmy(i, soldiers, at) {
        var army;
        dTest.recordJobs(function() { army = w.makeArmy(i, soldiers, at); });
        return army;
      }

      var test = dTest.contractTest(run, function() {
        w.removeArmies();
        Rooms.remove({gameId: w.gameId});
        Roomchats.remove({gameId: w.gameId});
        Alerts.remove({gameId: w.gameId});
        GlobalAlerts.remove({gameId: w.gameId});
        Gamestats.remove({gameId: w.gameId});
        Dailystats.remove({gameId: w.gameId});
        Villages.find({gameId: w.gameId}).forEach(function(v) {
          Villages.remove(v._id);
          Mapmaker.buildingRemoved(w.gameId, v.x, v.y);
        });
        restoreRelations();
      });


      try {

        // --- set_lord_and_vassal and its jobs ---

        test('set_lord_and_vassal: makes the lord and vassal and queues the jobs that follow a conquest', function() {
          var jobs = conquer(0, 1);
          var vassal = w.player(1);
          equal(vassal.lord, ids[0], 'vassal\'s lord');
          equal(vassal.king, ids[0], 'vassal\'s king');
          equal(vassal.is_king, false, 'vassal is no longer a king');
          assert(_.contains(w.player(0).allies_below, ids[1]), 'lord has the vassal below it');
          equal(w.player(0).king, ids[0], 'the lord is its own king');

          var names = _.uniq(_.pluck(jobs, 'name')).sort();
          ['checkForDominus', 'cleanupAllKingChatrooms', 'destroyKingChatroom', 'enemies_together_check',
            'enemy_on_building_check', 'generateTree', 'updateKingChatroom'].forEach(function(name) {
            assert(_.contains(names, name), name + ' queued (got ' + names.join(', ') + ')');
          });
          equal(dTest.jobsNamed(jobs, 'updateKingChatroom')[0].data.playerId, ids[1], 'updateKingChatroom for the vassal');
          equal(dTest.jobsNamed(jobs, 'destroyKingChatroom')[0].data.king_id, ids[1], 'the vassal\'s king room destroyed, since it was a king');
        });


        // --- king chatrooms ---

        test('updateKingChatroom: a vassal\'s update makes its king a room with every ally below, once', function() {
          conquer(0, 1);
          runJob('updateKingChatroom', {gameId: w.gameId, playerId: ids[1]});
          var room = kingRoom(0);
          assert(room, 'the king has a king room');
          equal(room.name, 'King ' + w.players[0].username + ' and Vassals', 'name');
          equal(sorted(room.members), sorted([ids[0], ids[1]]), 'members: king and vassal');
          equal(sorted(_.pluck(room.memberData, '_id')), sorted([ids[0], ids[1]]), 'memberData');
          equal(alertsOf('alert_newKingChatroom', ids[0]), 1, 'king alerted');

          conquer(0, 2);
          runJob('updateKingChatroom', {gameId: w.gameId, playerId: ids[2]});
          equal(Rooms.find({gameId: w.gameId, type: 'king'}).count(), 1, 'still one room');
          equal(sorted(kingRoom(0).members), sorted(ids), 'the new vassal added');
          equal(alertsOf('alert_newKingChatroom', ids[0]), 1, 'no second alert');
        });

        test('cleanupAllKingChatrooms: makes the room a king with vassals is missing, through updateKingChatroom for the king', function() {
          conquer(0, 1);
          assert(!kingRoom(0), 'no room yet');
          runJob('cleanupAllKingChatrooms', {gameId: w.gameId});
          var room = kingRoom(0);
          assert(room, 'room made');
          equal(sorted(room.members), sorted([ids[0], ids[1]]), 'king and vassal');
          equal(Rooms.find({gameId: w.gameId, type: 'king'}).count(), 1, 'only that room: kings without vassals get none');
        });

        test('destroyKingChatroom: removes the player\'s king rooms and their chats, and nothing else', function() {
          var king = dTest.settle(dChat.createChatroom(w.gameId, 'King room', 'king', ids[0], [ids[0], ids[1]], []));
          var normal = dTest.settle(dChat.createChatroom(w.gameId, 'Normal room', 'normal', ids[0], [ids[0], ids[1]], []));
          var other = dTest.settle(dChat.createChatroom(w.gameId, 'Other king', 'king', ids[2], [ids[2], ids[1]], []));
          [king, normal, other].forEach(function(room) {
            Roomchats.insert({gameId: w.gameId, room_id: room, text: 'hi', created_at: new Date()});
          });

          runJob('destroyKingChatroom', {king_id: ids[0]});
          assert(!Rooms.findOne(king), 'king room removed');
          equal(Roomchats.find({room_id: king}).count(), 0, 'its chats removed');
          assert(Rooms.findOne(normal), 'their normal room stays');
          equal(Roomchats.find({room_id: normal}).count(), 1, 'with its chat');
          assert(Rooms.findOne(other), 'another king\'s room stays');
        });

        test('cleanupAllKingChatrooms: removes rooms of missing owners and of one member, queues removal for non-kings, and fixes names', function() {
          conquer(0, 1);
          var gone = dTest.settle(dChat.createChatroom(w.gameId, 'King gone', 'king', 'noSuchPlayer', ['noSuchPlayer', ids[1]], []));
          var lonely = dTest.settle(dChat.createChatroom(w.gameId, 'King lonely', 'king', ids[2], [ids[2]], []));
          var notKing = dTest.settle(dChat.createChatroom(w.gameId, 'King of nothing', 'king', ids[1], [ids[1], ids[2]], []));
          var misnamed = dTest.settle(dChat.createChatroom(w.gameId, 'Wrong name', 'king', ids[0], [ids[0], ids[1]], []));
          Roomchats.insert({gameId: w.gameId, room_id: gone, text: 'hi', created_at: new Date()});

          var jobs = dTest.recordJobs(function() {
            runJob('cleanupAllKingChatrooms', {gameId: w.gameId});
          });
          assert(!Rooms.findOne(gone), 'room of a missing owner removed');
          equal(Roomchats.find({room_id: gone}).count(), 0, 'with its chats');
          assert(!Rooms.findOne(lonely), 'room with one member removed');
          var destroy = dTest.jobsNamed(jobs, 'destroyKingChatroom');
          equal(destroy.length, 1, 'destroyKingChatroom queued once');
          equal(destroy[0].data.king_id, ids[1], 'for the owner who is no longer a king');
          assert(Rooms.findOne(notKing), 'that room is left for the queued job');
          equal(Rooms.findOne(misnamed).name, 'King ' + w.players[0].username + ' and Vassals', 'renamed after its owner');
        });

        test('setupEveryoneChatroom: one "everyone" room with every player of the game, updated on later runs', function() {
          runJob('setupEveryoneChatroom', {gameId: w.gameId});
          var rooms = Rooms.find({gameId: w.gameId, type: 'everyone'}).fetch();
          equal(rooms.length, 1, 'one room');
          equal(rooms[0].name, 'Everyone', 'name');
          equal(rooms[0].owner, null, 'no owner');
          equal(sorted(rooms[0].members), sorted(ids), 'every player');

          var extra = Players.insert({gameId: w.gameId, userId: 'u_' + Random.id(5), username: 'late_' + Random.id(4)});
          try {
            runJob('setupEveryoneChatroom', {gameId: w.gameId});
            equal(Rooms.find({gameId: w.gameId, type: 'everyone'}).count(), 1, 'still one room');
            assert(_.contains(Rooms.findOne(rooms[0]._id).members, extra), 'the new player added');
          } finally {
            Players.remove(extra);
          }
        });


        // --- enemy_on_building_check, enemies_together_check ---

        test('enemy_on_building_check: an enemy army on a castle or village queues its battle, a vassal on its own lord\'s village does not', function() {
          conquer(0, 1);
          var castle = w.castle(2);
          quietArmy(0, {footmen: 3}, castle);
          var village = Villages.insert(_.extend({gameId: w.gameId, playerId: ids[0], user_id: w.users[0]._id, x: 0, y: 0,
            level: 1, under_construction: false}, w.freeHex(), dTest.soldierCounts({})));
          var v = Villages.findOne(village);
          quietArmy(1, {footmen: 3}, v);

          var jobs = dTest.recordJobs(function() {
            runJob('enemy_on_building_check', {gameId: w.gameId});
          });
          var battles = dTest.jobsNamed(jobs, 'runBattle');
          equal(battles.length, 1, 'one battle');
          equal(battles[0].uniqueId, w.gameId + '_' + castle.x + '_' + castle.y, 'at the enemy castle');
        });

        test('enemy_on_building_check: a vassal\'s army on its lord\'s castle attacks it, unless that would loop', function() {
          conquer(0, 1);
          var lordCastle = w.castle(0);
          var vassalCastle = w.castle(1);
          var army = quietArmy(1, {footmen: 3}, lordCastle);
          var jobs = dTest.recordJobs(function() {
            runJob('enemy_on_building_check', {gameId: w.gameId});
          });
          equal(dTest.jobsNamed(jobs, 'runBattle').length, 1, 'battle at the lord\'s castle');

          // the lord also has an army on the vassal's castle: capturing would go back and forth
          quietArmy(0, {footmen: 3}, vassalCastle);
          jobs = dTest.recordJobs(function() {
            runJob('enemy_on_building_check', {gameId: w.gameId});
          });
          equal(dTest.jobsNamed(jobs, 'runBattle').length, 0, 'no battle when it would loop');
          assert(dTest.settle(dInit.attackCreatesLoop(w.gameId, lordCastle.x, lordCastle.y)), 'attackCreatesLoop says so');
          assert(Armies.findOne(army._id), 'army still there');
        });

        test('enemies_together_check: enemies on one hex fight, a lord and vassal don\'t, unless one is dominus', function() {
          conquer(0, 1);
          var hex = w.freeHex();
          var spot = w.freeHex([hex]);
          quietArmy(0, {footmen: 3}, hex);
          quietArmy(1, {footmen: 3}, hex);
          quietArmy(0, {footmen: 3}, spot);
          quietArmy(2, {footmen: 3}, spot);

          var jobs = dTest.recordJobs(function() {
            runJob('enemies_together_check', {gameId: w.gameId});
          });
          var battles = _.uniq(_.pluck(dTest.jobsNamed(jobs, 'runBattle'), 'uniqueId'));
          equal(JSON.stringify(battles), JSON.stringify([w.gameId + '_' + spot.x + '_' + spot.y]), 'only the enemies\' hex');

          Players.update(ids[0], {$set: {is_dominus: true}});
          jobs = dTest.recordJobs(function() {
            runJob('enemies_together_check', {gameId: w.gameId});
          });
          battles = _.uniq(_.pluck(dTest.jobsNamed(jobs, 'runBattle'), 'uniqueId'));
          assert(_.contains(battles, w.gameId + '_' + hex.x + '_' + hex.y), 'dominus fights its own vassal');
        });


        // --- removeDominus, generateTree ---

        test('removeDominus: the dominus loses the title and both alerts go out; with no dominus nothing happens', function() {
          Players.update(ids[2], {$set: {is_dominus: true}});
          runJob('removeDominus', {gameId: w.gameId});
          equal(w.player(2).is_dominus, false, 'no longer dominus');
          equal(alertsOf('alert_noLongerDominusNewUser', ids[2]), 1, 'player alerted');
          equal(GlobalAlerts.find({gameId: w.gameId, type: 'ga_noLongerDominusNewUser'}).count(), 1, 'everyone alerted');

          runJob('removeDominus', {gameId: w.gameId});
          equal(GlobalAlerts.find({gameId: w.gameId}).count(), 1, 'no second alert');
        });

        test('generateTree: the game\'s tree lists each king by name with its vassals nested below', function() {
          conquer(0, 1);
          conquer(1, 2);
          runJob('generateTree', {gameId: w.gameId});
          var tree = Games.findOne(w.gameId).tree;
          equal(tree.length, 1, 'one king');
          equal(tree[0]._id, ids[0], 'player 0 at the top');
          equal(tree[0].vassals.length, 1, 'one vassal');
          equal(tree[0].vassals[0]._id, ids[1], 'player 1');
          equal(tree[0].vassals[0].vassals[0]._id, ids[2], 'player 2 below player 1');
          equal(tree[0].username, w.players[0].username, 'with names');

          restoreRelations();
          runJob('generateTree', {gameId: w.gameId});
          tree = Games.findOne(w.gameId).tree;
          equal(JSON.stringify(_.pluck(tree, 'username')), JSON.stringify(_.sortBy(_.pluck(w.players, 'username'), _.identity)), 'three kings, by name');
        });


        // --- stats ---

        test('gamestats_job: known bug: each run adds a Gamestats doc, since the period it upserts into ends before it begins', function() {
          // gamestatsEnd adds the undefined _s.init.statsInverval to the start of
          // the 6 hour dailystats period, so the range is always empty
          assert(_s.init.gamestatsEnd() <= _s.init.gamestatsBegin(), 'period ends at or before its start');
          runJob('gamestats_job', {gameId: w.gameId});
          runJob('gamestats_job', {gameId: w.gameId});
          var docs = Gamestats.find({gameId: w.gameId}).fetch();
          equal(docs.length, 2, 'two docs, not one for the period');
          equal(docs[1].num_users, 3, 'num_users');
          _s.armies.types.forEach(function(type) {
            var one = dTest.soldierCounts({});
            one[type] = 1;
            equal(docs[1].soldierWorth[type], dArmies.worth(w.gameId, one), type + ' worth');
          });
        });

        test('initDailystatsForNewUser: a zeroed Dailystats doc ranked last among the game\'s players', function() {
          Games.update(w.gameId, {$set: {numPlayers: 7}});
          runJob('initDailystatsForNewUser', {gameId: w.gameId, userId: w.users[0]._id, playerId: ids[0]});
          var doc = Dailystats.findOne({playerId: ids[0]});
          assert(doc, 'inserted');
          equal(doc.incomeRank, 7, 'incomeRank is numPlayers');
          equal(doc.user_id, w.users[0]._id, 'user_id');
          equal(doc.numVassals, 0, 'numVassals');
          equal(doc.inc.gold, 0, 'inc.gold');
        });

        test('generateTree: a lord\'s vassals are listed by name', function() {
          conquer(0, 2);
          conquer(0, 1);
          runJob('generateTree', {gameId: w.gameId});
          var tree = Games.findOne(w.gameId).tree;
          equal(tree.length, 1, 'one king');
          equal(JSON.stringify(_.pluck(tree[0].vassals, 'username')),
            JSON.stringify(_.sortBy([w.players[1].username, w.players[2].username], _.identity)), 'both vassals, by name');
          equal(JSON.stringify(_.pluck(tree[0].vassals, 'vassals')), '[[],[]]', 'with no vassals of their own');
          restoreRelations();
        });


        // --- updateOverallPlayerRankings ---

        test('updateOverallPlayerRankings: wins, games and points from ended games, regular and pro kept apart', function() {
          var users = _.times(3, function() { return t.createTestUser(); });
          var a = users[0]._id, b = users[1]._id, c = users[2]._id;
          var results = function(numVassals, income) {
            return {numVassals: numVassals, income: income};
          };
          var games = [
            // regular: a won, a is 1st by vassals and 3rd by income, b 2nd and 1st
            t.createTestGame({name: 'Rankings Regular', hasEnded: true,
              results: results([{userId: a, rank: 1}, {userId: b, rank: 2}], [{userId: b, rank: 1}, {userId: a, rank: 3}])}),
            // pro: c is 1st by both
            t.createTestGame({name: 'Rankings Pro', hasEnded: true, isProOnly: true,
              results: results([{userId: c, rank: 1}], [{userId: c, rank: 1}])}),
            // not ended, and crazy fast: neither counts
            t.createTestGame({name: 'Rankings Running'}),
            t.createTestGame({name: 'Rankings Crazy', hasEnded: true, isCrazyFast: true,
              results: results([{userId: b, rank: 1}], [{userId: b, rank: 1}])})
          ];
          var gameIds = _.pluck(games, '_id');
          var join = function(game, userId, won) {
            Players.insert({gameId: gameIds[game], userId: userId, username: 'rankings', wonGame: won});
          };
          join(0, a, true);
          join(0, b, false);
          join(1, c, false);
          join(2, a, true);
          join(3, b, true);
          // a rank 1 is 110 points, 2 is 89, 3 is 78
          try {
            runJob('updateOverallPlayerRankings', {});
            var ranking = function(userId, kind) { return Meteor.users.findOne(userId)[kind]; };
            var fields = function(r) { return [r.numGames, r.wins, r.numVassalsPoints, r.incomePoints, r.overallPoints].join(','); };
            equal(fields(ranking(a, 'rankingRegular')), '1,1,110,78,688', 'a regular: one game, a win, 500 + 110 + 78 points');
            equal(fields(ranking(b, 'rankingRegular')), '1,0,89,110,199', 'b regular: the crazy fast win doesn\'t count');
            equal(fields(ranking(c, 'rankingPro')), '1,0,110,110,220', 'c pro');
            equal(fields(ranking(a, 'rankingPro')), '0,0,0,0,0', 'a has no pro games');
            equal(fields(ranking(c, 'rankingRegular')), '0,0,0,0,0', 'c has no regular games');

            // ranks: one more than the number of users with more points
            var rankOf = function(userId, kind, field) {
              var points = ranking(userId, kind)[field + 'Points'];
              var above = {};
              above[kind + '.' + field + 'Points'] = {$gt: points};
              var tied = {};
              tied[kind + '.' + field + 'Points'] = points;
              var rank = ranking(userId, kind)[field + 'Rank'];
              var lowest = Meteor.users.find(above).count() + 1;
              assert(rank >= lowest && rank < lowest + Meteor.users.find(tied).count(),
                userId + ' ' + kind + ' ' + field + 'Rank ' + rank + ', expected from ' + lowest);
              return rank;
            };
            assert(rankOf(a, 'rankingRegular', 'numVassals') < rankOf(b, 'rankingRegular', 'numVassals'), 'a above b by vassals');
            assert(rankOf(b, 'rankingRegular', 'income') < rankOf(a, 'rankingRegular', 'income'), 'b above a by income');
            assert(rankOf(a, 'rankingRegular', 'overall') < rankOf(b, 'rankingRegular', 'overall'), 'a above b overall');
            ['numVassals', 'income', 'overall'].forEach(function(field) { rankOf(c, 'rankingPro', field); });
            equal(ranking(a, 'rankingPro').overallRank, 0, 'no pro points, no pro rank');

            // run again: the same, not doubled
            runJob('updateOverallPlayerRankings', {});
            equal(fields(ranking(a, 'rankingRegular')), '1,1,110,78,688', 'a regular after a second run');
          } finally {
            gameIds.forEach(function(id) { Players.remove({gameId: id}); Games.remove(id); });
            users.forEach(function(user) { t.cleanupUser(user._id); });
          }
        });


        // --- sendGameStartedEmail (Email.sendAsync replaced) ---

        test('sendGameStartedEmail: emails a link to the game to a user with an address, and nobody without one', function() {
          var sent = [];
          // the job sends with Email.sendAsync since upgrade PR 15; Email.send
          // is replaced too, so a send through either never leaves the test
          var send = Email.send;
          var sendAsync = Email.sendAsync;
          Email.send = function(options) { sent.push(options); };
          Email.sendAsync = async function(options) { sent.push(options); };
          var withEmail = t.createTestUser({emails: [{address: 'started_' + Random.id(4).toLowerCase() + '@example.com', verified: true}]});
          var without = t.createTestUser();
          try {
            runJob('sendGameStartedEmail', {gameId: w.gameId, gameName: 'Test World', userId: withEmail._id});
            runJob('sendGameStartedEmail', {gameId: w.gameId, gameName: 'Test World', userId: without._id});
            runJob('sendGameStartedEmail', {gameId: w.gameId, gameName: 'Test World', userId: 'noSuchUser'});
          } finally {
            Email.send = send;
            Email.sendAsync = sendAsync;
            Meteor.users.remove({_id: {$in: [withEmail._id, without._id]}});
          }
          equal(sent.length, 1, 'one email');
          assert(sent[0].to.indexOf(withEmail.emails[0].address) != -1, 'to the user');
          equal(sent[0].subject, 'Game Started', 'subject');
          assert(sent[0].html.indexOf('/game/' + w.gameId) != -1, 'links to the game');
        });

      } finally {
        w.cleanup();
      }
    });


    // A game of its own, since ending and closing it removes the game's documents.
    dTest.addSuite('jobs: game end and close (server/gameJobTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var runJob = dTest.runJob;

      if (process.env.DOMINUS_WORKER != 'true') {
        run('game end jobs: need the worker', function() { return 'skip'; });
        return;
      }

      function endedGame(fields) {
        var game = t.createTestGame(_.extend({name: 'Ending ' + Random.id(4), hasStarted: true, isStarting: true,
          startedAt: new Date()}, fields));
        var users = [0, 1, 2].map(function() {
          return t.createTestUser({emails: [{address: 'end_' + Random.id(5).toLowerCase() + '@example.com', verified: true}]});
        });
        var players = users.map(function(user, i) {
          return Players.insert({gameId: game._id, userId: user._id, username: user.username, x: i, y: 0,
            castle_id: 'castle' + i, income: 100 * (i + 1), num_allies_below: 2 - i, losses_worth: i, losses_num: i,
            is_dominus: false, allies_above: [], allies_below: []});
        });
        return {game: game, users: users, players: players};
      }

      function cleanup(g) {
        t.cleanup(g.game._id);
        dTest.gameCollections().forEach(function(collection) { collection.remove({gameId: g.game._id}); });
        g.users.forEach(function(user) { Meteor.users.remove(user._id); });
      }

      // the game the start job would pick: the only one waiting whose start time came
      function startingGame(fields) {
        var game = t.createTestGame(_.extend({name: 'Starting ' + Random.id(4), hasStarted: false, isStarting: false,
          startAt: moment().subtract(1, 'minute').toDate()}, fields));
        var waiting = Games.find({hasStarted: false, isStarting: false, startAt: {$lte: new Date()}}, {fields: {name: 1}}).fetch();
        equal(JSON.stringify(_.pluck(waiting, '_id')), JSON.stringify([game._id]), 'no other game waits to start: ' + _.pluck(waiting, 'name').join(', '));
        return game;
      }

      run('checkForGameStart: a game past its start time starts: a player for each signup, its market, and the start jobs', function() {
        var game = startingGame();
        var user = t.createTestUser({emails: [{address: 'start_' + Random.id(5).toLowerCase() + '@example.com', verified: true}]});
        var g = {game: game, users: [user]};
        var sizes = _.pick(_s.mapmaker, 'minHexesInCountry', 'maxHexesInCountry');
        try {
          Gamesignups.insert({gameId: game._id, userId: user._id, username: user.username, createdAt: new Date(), usedToken: false});
          Mapmaker.eraseMap(game._id);
          _s.mapmaker.minHexesInCountry = 100;
          _s.mapmaker.maxHexesInCountry = 100;
          Mapmaker.addCountry(game._id, true);
          _.extend(_s.mapmaker, sizes);

          var jobs = dTest.recordJobs(function() {
            runJob('checkForGameStart', {});
          });

          var started = Games.findOne(game._id);
          equal(started.hasStarted, true, 'started');
          assert(started.startedAt, 'startedAt set');
          equal(started.taxesCollected, 0, 'no taxes yet');
          var player = Players.findOne({gameId: game._id, userId: user._id});
          assert(player && player.castle_id, 'the signup has a player and a castle');
          equal(Market.find({gameId: game._id}).count(), _s.market.types.length, 'a market');
          equal(Gamesignups.find({gameId: game._id}).count(), 0, 'the signups are gone');
          equal(dTest.jobsNamed(jobs, 'initDailystatsForNewUser').length, 1, 'daily stats for the player');
          equal(dTest.jobsNamed(jobs, 'setupEveryoneChatroom').length, 1, 'the everyone chatroom');
          equal(dTest.jobsNamed(jobs, 'generateTree').length, 1, 'the tree');
          var emails = dTest.jobsNamed(jobs, 'sendGameStartedEmail');
          equal(JSON.stringify(_.map(emails, function(j) { return j.data.userId; })), JSON.stringify([user._id]), 'an email to the player');
        } finally {
          _.extend(_s.mapmaker, sizes);
          cleanup(g);
        }
      });

      // startGame is async since upgrade PR 15: the job must wait for it to
      // catch its failure
      run('checkForGameStart: when the start fails, isStarting is put back so a later run tries again', function() {
        var game = startingGame();
        var startGame = dManager.startGame;
        var error = null;
        try {
          dManager.startGame = async function() { await Promise.resolve(); throw new Error('planted start failure'); };
          var errors = [];
          var consoleError = console.error;
          console.error = function() { errors.push(_.toArray(arguments)); };
          try {
            error = runJob('checkForGameStart', {}, {allowError: true}).error;
          } finally {
            console.error = consoleError;
          }
          assert(error && /planted start failure/.test(error.message), 'the job failed with the start\'s error: ' + (error && error.message));
          assert(_.some(errors, function(e) { return e[0] == 'startGame failed, resetting isStarting'; }), 'and logged it');
          var after = Games.findOne(game._id);
          equal(after.isStarting, false, 'isStarting put back');
          equal(after.hasStarted, false, 'not started');
        } finally {
          dManager.startGame = startGame;
          t.cleanup(game._id);
        }
      });

      run('checkForGameEnd: a game past its end date ends with its dominus the winner, ranked results and a close date', function() {
        var g = endedGame({endDate: moment().subtract(1, 'minute').toDate()});
        try {
          Players.update(g.players[0], {$set: {is_dominus: true}});
          Villages.insert({gameId: g.game._id, playerId: g.players[1], user_id: g.users[1]._id, username: g.users[1].username,
            income: {worth: 50}, x: 5, y: 5});
          var jobs = dTest.recordJobs(function() {
            runJob('checkForGameEnd', {});
          });

          var game = Games.findOne(g.game._id);
          equal(game.hasEnded, true, 'ended');
          equal(game.winningPlayer.playerId, g.players[0], 'the dominus won');
          equal(game.winningPlayer.email, g.users[0].emails[0].address, 'with their email');
          var days = moment(game.closeDate).diff(moment(), 'hours');
          assert(days >= 71 && days <= 72, 'closes in 3 days (' + days + ' hours)');
          equal(JSON.stringify(_.pluck(game.results.income, 'playerId')), JSON.stringify(g.players.slice().reverse()), 'results by income');
          equal(JSON.stringify(_.pluck(game.results.numVassals, 'playerId')), JSON.stringify(g.players), 'results by vassals');
          equal(game.results.villages[0].villageWorth, 50, 'results by village');
          equal(game.results.lostSoldiers[0].playerId, g.players[2], 'results by losses');

          var players = g.players.map(function(id) { return Players.findOne(id); });
          equal(players[0].wonGame, true, 'winner wonGame');
          equal(players[1].wonGame, false, 'others did not win');
          assert(_.every(players, function(p) { return p.gameIsOver; }), 'every player gameIsOver');
          assert(dTest.waitFor(function() { return Players.findOne(g.players[2]).rankByIncome == 1; }, 5000),
            'rankByIncome copied from Dailystats (got ' + Players.findOne(g.players[2]).rankByIncome + ')');
          equal(GlobalAlerts.find({gameId: g.game._id, type: 'ga_gameOver'}).count(), 1, 'game over alert');
          equal(dTest.jobsNamed(jobs, 'updateOverallPlayerRankings').length, 1, 'overall rankings queued');
        } finally {
          cleanup(g);
        }
      });

      run('checkForGameEnd: with no dominus to name the winner, the countdown is cleared and the game goes on', function() {
        var g = endedGame({endDate: moment().subtract(1, 'minute').toDate(), lastDominusPlayerId: 'noSuchPlayer'});
        try {
          runJob('checkForGameEnd', {});
          var game = Games.findOne(g.game._id);
          equal(game.hasEnded, false, 'not ended');
          equal(game.endDate, null, 'endDate cleared');
          equal(game.lastDominusPlayerId, null, 'lastDominusPlayerId cleared');
          assert(!Players.findOne(g.players[0]).gameIsOver, 'players not sent to game over');
        } finally {
          cleanup(g);
        }
      });

      run('checkForGameClose: a game past its close date is closed: its documents removed, players marked, the game trimmed, S3 bakes deleted', function() {
        var g = endedGame({hasEnded: true, closeDate: moment().subtract(1, 'minute').toDate(), tree: [{_id: 'x'}], taxesCollected: 5});
        var deleted = [];
        var deleteBakes = Mapbaker.deleteS3BakesForGame;
        Mapbaker.deleteS3BakesForGame = function(gameId) { deleted.push(gameId); };
        try {
          var gameId = g.game._id;
          Castles.insert({gameId: gameId, x: 0, y: 0, playerId: g.players[0]});
          Armies.insert({gameId: gameId, x: 0, y: 0, playerId: g.players[0]});
          Hexes.insert({gameId: gameId, x: 0, y: 0});
          Rooms.insert({gameId: gameId, type: 'everyone', members: []});
          Market.insert({gameId: gameId, type: 'grain', price: 1});

          runJob('checkForGameClose', {});

          var game = Games.findOne(gameId);
          equal(game.hasClosed, true, 'closed');
          equal(game.tree, undefined, 'fields outside the kept list removed');
          equal(game.taxesCollected, undefined, 'taxesCollected removed');
          equal(game.name, g.game.name, 'name kept');
          [Castles, Armies, Hexes, Rooms, Market].forEach(function(collection) {
            equal(collection.find({gameId: gameId}).count(), 0, collection._name + ' removed');
          });
          assert(dTest.waitFor(function() { return Players.find({gameId: gameId, gameIsClosed: true}).count() == 3; }, 5000),
            'players marked gameIsClosed');
          equal(Players.find({gameId: gameId}).count(), 3, 'players kept');
          equal(JSON.stringify(deleted), JSON.stringify([gameId]), 'S3 bakes deleted for the game');
        } finally {
          Mapbaker.deleteS3BakesForGame = deleteBakes;
          cleanup(g);
        }
      });
    });
  });
}
