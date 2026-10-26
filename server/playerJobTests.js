// Job tests: players joining and leaving a game, and the game's counters
// (upgrade PR 11, Oct 2026).
//
// Same approach as server/gameJobTests.js: each queue job's handler is run
// directly (dTest.runJob) in a real started game, and the jobs it adds are
// recorded rather than run (dTest.recordJobs). The tests describe what the
// jobs do today. A test named "known bug" describes a bug in today's code;
// fixing the bug means changing that test on purpose.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    dTest.addSuite('jobs: players joining and leaving, and game counters (server/playerJobTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var runJob = dTest.runJob;

      if (process.env.DOMINUS_WORKER != 'true') {
        await run('player jobs: need the worker', function() { return 'skip'; });
        return;
      }

      var w = await dTest.buildGameWorld({players: 2});
      var users = [];

      async function newUser(fields) {
        var user = await dTest.helpers.createTestUser(_.extend({username: 'joiner_' + Random.id(5)}, fields || {}));
        users.push(user._id);
        return user;
      }

      function join(user) {
        return dTest.recordJobs(async function() {
          await runJob('createPlayer', {gameId: w.gameId, userId: user._id, username: user.username, makePro: false});
        });
      }

      var test = dTest.contractTest(run);

      try {

        await test('createPlayer job: a late joiner gets a player and a castle, then the jobs that follow are queued', async function() {
          var user = await newUser();
          var jobs = await join(user);
          var player = await Players.findOneAsync({gameId: w.gameId, userId: user._id});
          assert(player, 'a player');
          equal(player.username, user.username, 'named as asked');
          equal(player.gold, _gs.init(w.gameId, 'startingResources.gold'), 'with the starting gold');
          var castle = await Castles.findOneAsync(player.castle_id);
          assert(castle, 'a castle');
          equal(castle.x + ',' + castle.y, player.x + ',' + player.y, 'where the player says');
          equal(castle.playerId, player._id, 'owned by the player');
          equal((await Hexes.findOneAsync({gameId: w.gameId, x: castle.x, y: castle.y})).hasBuilding, true, 'on a hex marked as built on');
          equal(JSON.stringify(jobs.map(function(j) { return [j.name, j.uniqueId]; })),
            JSON.stringify([['removeDominus', w.gameId], ['initDailystatsForNewUser', false], ['setupEveryoneChatroom', w.gameId], ['generateTree', w.gameId]]),
            'the jobs queued');
          equal(jobs[1].data.playerId, player._id, 'the stats are for the new player');
        });

        await test('createPlayer job: a user who can\'t join gets no player, and nothing is queued', async function() {
          var unverified = await newUser({verifiedEmail: false});
          var before = await dTest.snapshot(w.gameId, [Players, Castles, Hexes]);
          equal((await join(unverified)).length, 0, 'email not verified: nothing queued');
          equal((await join(w.users[0])).length, 0, 'already in the game: nothing queued');
          await dTest.assertUnchanged(w.gameId, before, 'a refused join changed the game', [Players, Castles, Hexes]);
        });

        await test('deleteGameAccount job: known bug: a deleted player stays the owner of a chat room they owned, since removeOwnerFromRoom is passed the game id', async function() {
          var user = await newUser();
          await join(user);
          var player = await Players.findOneAsync({gameId: w.gameId, userId: user._id});
          var other = w.players[0]._id;
          var roomId = await Rooms.insertAsync({gameId: w.gameId, type: 'normal', name: 'Leaving', owner: player._id,
            members: [player._id, other], admins: [player._id, other],
            memberData: [{_id: player._id, username: player.username}, {_id: other, username: w.players[0].username}]});
          try {
            var jobs = await dTest.recordJobs(async function() {
              await runJob('deleteGameAccount', {playerId: player._id, gameId: w.gameId, username: player.username});
            });
            assert(!await Players.findOneAsync(player._id), 'the player is removed');
            assert(!await Castles.findOneAsync(player.castle_id), 'and their castle');
            equal((await Hexes.findOneAsync({gameId: w.gameId, x: player.x, y: player.y})).hasBuilding, false, 'whose hex is free again');
            assert(await GlobalAlerts.findOneAsync({gameId: w.gameId, type: 'ga_accountDeleted', 'vars.username': player.username}), 'everyone is told');
            var room = await Rooms.findOneAsync(roomId);
            equal(JSON.stringify([room.members, room.admins, _.pluck(room.memberData, '_id')]), JSON.stringify([[other], [other], [other]]),
              'they leave the room');
            // known bug: with the room's id passed, the admin left would be the owner
            equal(room.owner, player._id, 'but stay its owner');
            var names = _.pluck(jobs, 'name');
            assert(_.contains(names, 'setupEveryoneChatroom') && _.contains(names, 'generateTree'), 'the room and tree jobs are queued: ' + names.join());
          } finally {
            await Rooms.removeAsync(roomId);
          }
        });

        await test('game counters: numPlayers, numVillages and numCountries follow the game\'s documents, and a closed game is left alone', async function() {
          var fields = ['numPlayers', 'numVillages', 'numCountries'];
          var collections = [Players, Villages, Countries];
          // a game that never had a village has no numVillages yet
          var counted = async function() {
            var game = await Games.findOneAsync(w.gameId);
            return fields.map(function(f) { return game[f] === undefined ? 0 : game[f]; }).join();
          };
          var actual = async function() {
            return (await dTest.mapAsync(collections, async function(c) { return await c.find({gameId: w.gameId}).countAsync(); })).join();
          };
          var settles = async function(message) {
            // the counts are written a second after the last change
            assert(await dTest.waitFor(async function() { return await counted() == await actual(); }, 10000), message + ': ' + await counted() + ' counted, ' + await actual() + ' there');
          };
          var ids = [];
          try {
            await settles('at the start');
            await dTest.eachAsync(collections, async function(c) { ids.push(await c.insertAsync({gameId: w.gameId, counterTest: true})); });
            await settles('after adding one of each');
            equal(await counted(), await actual(), 'counted');
            await Villages.removeAsync(ids[1]);
            await settles('after removing a village');

            await Games.updateAsync(w.gameId, {$set: {hasClosed: true}});
            var closed = await counted();
            ids[1] = await Villages.insertAsync({gameId: w.gameId, counterTest: true});
            await dTest.sleep(2500);
            equal(await counted(), closed, 'a closed game\'s counts are not written');
            await Games.updateAsync(w.gameId, {$set: {hasClosed: false}});
            await Villages.removeAsync(ids[1]);
            await Villages.insertAsync({gameId: w.gameId, counterTest: true});
            await settles('open again: the next change writes them');
          } finally {
            await Games.updateAsync(w.gameId, {$set: {hasClosed: false}});
            await dTest.eachAsync(collections, async function(c) { await c.removeAsync({gameId: w.gameId, counterTest: true}); });
          }
        });

      } finally {
        await dTest.waitForJobs();
        await w.cleanup();
        await dTest.eachAsync(users, async function(id) { await Meteor.users.removeAsync(id); });
      }
    });
  });
}
