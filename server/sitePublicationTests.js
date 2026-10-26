// Publication contracts: what the site's publications send outside a game
// (Oct 2026): the null publications every client gets, the landing pages,
// results and rankings, profiles, the forum, and the admin and moderator
// control pages.
//
// Same approach as server/gamePublicationTests.js: each publication is
// subscribed to over a real DDP connection and the test checks exactly
// which documents arrive and which fields they have, against the database
// (dTest.checkPublication, server/lib/testRunnerDdp.js). A test named "known
// bug" describes a bug in today's code.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    dTest.addSuite('publication contracts: site, forum and control (server/sitePublicationTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var made = {users: [], games: [], topics: []};
      var f = {};   // fixture ids


      // --- Helpers ---

      // a test user with no connection
      async function account(fields) {
        var user = await dTest.helpers.createTestUser(_.extend({username: 'pub_' + Random.id(6)}, fields || {}));
        made.users.push(user._id);
        return user._id;
      }

      async function game(fields) {
        var g = await dTest.helpers.createTestGame(_.extend({name: 'Pub ' + Random.id(4)}, fields || {}));
        made.games.push(g._id);
        return g._id;
      }

      async function topic(fields) {
        var id = await Forumtopics.insertAsync(_.extend({title: 'Pub topic', categoryId: 'cat1', numPosts: 1, numViews: 0, isPinned: false,
          createdAt: new Date(), updatedAt: new Date(), lastPostDate: new Date()}, fields || {}));
        made.topics.push(id);
        return id;
      }

      function daysAgo(n) {
        return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
      }

      // a full rate limit allowance for each check: the limits are 5 a user in 5 seconds
      async function check(spec) {
        dTest.ddp.resetRateLimits();
        await dTest.checkPublication(spec);
      }

      // _ids of source.find(selector, options), for publications with a sort and limit
      async function idsOf(source, selector, options) {
        return _.pluck(await source.find(selector, _.extend({fields: {_id: 1}}, options)).fetchAsync(), '_id');
      }


      try {

        // --- Fixtures ---

        f.admin = await account({admin: true});
        f.mod = await account({moderator: true});
        f.plain = await account({avatarFilename: 'plain.png', purchases: {castles: ['a']}, created_at: new Date(), profile: {x: 1},
          emails: [{address: 'plain_' + Random.id(4) + '@example.com', verified: true}],
          services: {password: {bcrypt: 'secret'}, google: {id: 'g_' + Random.id(6), email: 'plain@example.com', accessToken: 'secret'}},
          lastActive: new Date(), hex_scale: 1.5, sp_show_coords: true, notPublished: 'x'});
        f.unverified = await account({verifiedEmail: false});
        f.banned = await account({banned: true, bannedDate: new Date(), bannedBy: 'someone', reason: 'spam', services: {password: {bcrypt: 'secret'}}});
        f.ranked = await account({createdAt: new Date(), avatarFilename: 'ranked.png', services: {password: {bcrypt: 'secret'}},
          rankingRegular: {numGames: 3, overallRank: 1, points: 30}, rankingPro: {numGames: 2, overallRank: 4, points: 9}});
        f.ranked2 = await account({rankingRegular: {numGames: 1, overallRank: 2, points: 10}});
        f.unranked = await account({rankingRegular: {numGames: 0, overallRank: 0}, rankingPro: {numGames: 0, overallRank: 0}});
        f.online = await account({pro: true, presence: {status: 'online', updatedAt: new Date(), clientAddress: '10.0.0.1'}});
        f.offline = await account({presence: {status: 'offline', updatedAt: new Date()}});
        f.statusOnline = await account({status: {online: true, lastLogin: {ipAddr: '10.0.0.2'}}});

        f.ended = await game({hasStarted: true, hasEnded: true, hasClosed: true, startedAt: daysAgo(30), endDate: daysAgo(1), numPlayers: 2,
          winningPlayer: {username: 'winner', userId: f.ranked}, privateNote: 'x'});
        f.endedOld = await game({hasStarted: true, hasEnded: true, hasClosed: true, startedAt: daysAgo(60), endDate: daysAgo(31), numPlayers: 3});
        f.open = await game({startAt: new Date(Date.now() + 1000 * 60 * 60 * 24), maxPlayers: 5, numPlayers: 1, privateNote: 'x'});
        f.signup = await Gamesignups.insertAsync({gameId: f.open, userId: f.plain, username: 'plain', createdAt: new Date(), usedToken: false});

        f.playerOver = await Players.insertAsync({gameId: f.ended, userId: f.ranked, username: 'ranked', gameIsOver: true, gameIsClosed: true,
          wonGame: true, rankByIncome: 1, rankByVassals: 2, income: 9, gameName: 'ended'});
        f.playerOtherOver = await Players.insertAsync({gameId: f.endedOld, userId: f.ranked2, gameIsOver: true, gameIsClosed: true, wonGame: false});
        f.playerOpen = await Players.insertAsync({gameId: f.open, userId: f.plain, username: 'plain', gameIsOver: false, gameIsClosed: false,
          gameName: 'open', income: 5});
        f.playerClosed = await Players.insertAsync({gameId: f.ended, userId: f.plain, username: 'plain', gameIsOver: true, gameIsClosed: true,
          gameName: 'ended'});

        f.charge = await Charges.insertAsync({user_id: f.plain, amount: 500, created_at: new Date()});
        f.gamestat = await Gamestats.insertAsync({gameId: f.ended, created_at: new Date(), num_users: 2});
        f.room = await Rooms.insertAsync({gameId: f.ended, name: 'Pub room', type: 'normal', members: [], admins: [], owner: null});
        f.roomchat = await Roomchats.insertAsync({room_id: f.room, gameId: f.ended, text: 'hi', user_id: f.plain, created_at: new Date()});
        f.report = await Reports.insertAsync({gameId: f.ended, createdAt: new Date(), reason: 'pub test'});
        f.kuestat = await KueStats.insertAsync({jobName: 'pubTest', count: 1, date: new Date()});
        f.oldResult = await OldResults.insertAsync({name: 'Old game', gameNumber: 7, startDate: daysAgo(400), createdAt: daysAgo(400),
          results: {winner: {username: 'oldwinner', userId: 'x'}, rankings: [1, 2]}, private: 'x'});

        f.pinned = await topic({isPinned: true, title: 'Pinned'});
        f.topicNew = await topic({numPosts: 5, lastPostDate: daysAgo(1), createdAt: daysAgo(3)});
        f.topicOtherCat = await topic({categoryId: 'cat2', numPosts: 2, lastPostDate: daysAgo(2), createdAt: daysAgo(2)});
        f.topicOld = await topic({numPosts: 9, updatedAt: daysAgo(60), lastPostDate: daysAgo(60), createdAt: daysAgo(60)});
        // with topicNew and topicOld, the first 2 of category cat1 differ by each sort:
        // last post {mid, new}, created {new, old}, posts {old, mid}
        f.topicMid = await topic({numPosts: 7, lastPostDate: new Date(), createdAt: daysAgo(90)});
        f.post = await Forumposts.insertAsync({topicId: f.topicNew, userId: f.plain, username: 'plain', text: 'post', createdAt: new Date()});
        await Forumposts.insertAsync({topicId: f.topicOld, userId: f.plain, username: 'plain', text: 'other', createdAt: new Date()});

        var test = dTest.contractTest(run);
        var unitFields = ['username', 'castle_id', 'x', 'y'];


        // --- null publications: sent to every client without subscribing ---

        await test('null publications: your own user document, and your open games', async function() {
          var ownFields = ['admin', 'created_at', 'hex_scale', 'purchases', 'sp_show_coords', 'sp_show_minimap', 'emails', 'lastActive',
            'presence', 'possibleDupe', 'verifiedEmail', 'pro', 'proTokens', 'male', 'avatarFilename', 'banned', 'moderator',
            // accounts-base's own null publication
            'username', 'profile',
            // okgrow:analytics: services.{facebook,google,github}.email only,
            // never the password hash, login tokens or access tokens
            'services'];
          await check({pub: null, as: f.plain, parts: [
            {coll: 'users', source: Meteor.users, query: {_id: f.plain}, keys: ownFields,
              nested: {services: ['facebook.email', 'google.email', 'github.email']}},
            {coll: 'mygames', source: Players, query: {_id: f.playerOpen}, keys: ['gameId', 'gameName']}
          ]});
          await check({pub: null, as: null, who: 'out', parts: [
            {coll: 'users', source: Meteor.users, query: null},
            {coll: 'mygames', source: Players, query: null}
          ]});
        });


        // --- landing: games, signups, results, rankings ---

        await test('landingGames and landingGame: games that have not ended, for anyone', async function() {
          var keys = ['isNoLargeResources', 'isKingOfHill', 'isRelaxed', 'isSpeed', 'isSuperSpeed', 'isCrazyFast', 'isProOnly',
            'numPlayers', 'startAt', 'maxPlayers', 'name', 'desc', 'hasEnded', 'hasStarted'];
          await dTest.eachAsync([null, f.plain], async function(as) {
            await check({pub: 'landingGames', as: as, coll: 'games', source: Games, query: {hasEnded: false}, keys: keys.concat(['dominusAchieved'])});
            await check({pub: 'landingGame', as: as, args: [f.open], coll: 'games', source: Games, query: {_id: f.open}, keys: keys});
          });
          await check({pub: 'landingGame', as: null, args: [f.ended], coll: 'games', source: Games, query: {_id: f.ended}, keys: keys});
          await check({pub: 'landingGame', as: null, args: [], error: 400});
          await check({pub: 'landingGame', as: null, args: ['nope'], coll: 'games', source: Games, query: null});
        });

        await test('gamesSignups and gameSignups: every signup, whole documents, for anyone', async function() {
          await check({pub: 'gamesSignups', as: null, coll: 'gamesignups', source: Gamesignups, query: {}, keys: 'all'});
          await check({pub: 'gameSignups', as: null, args: [f.open], coll: 'gamesignups', source: Gamesignups, query: {gameId: f.open}, keys: 'all'});
          await check({pub: 'gameSignups', as: null, args: [f.ended], coll: 'gamesignups', source: Gamesignups, query: null});
        });

        await test('landingResultTitles and landingResult: ended games, newest first, for anyone', async function() {
          await check({pub: 'landingResultTitles', as: null, coll: 'games', source: Games,
            ids: await idsOf(Games, {hasEnded: true}, {sort: {endDate: -1}, limit: 200}),
            keys: ['numPlayers', 'maxPlayers', 'isRelaxed', 'isSpeed', 'isSuperSpeed', 'isCrazyFast', 'isKingOfHill', 'isProOnly',
              'hasEnded', 'name', 'winningPlayer', 'startedAt', 'endDate']});
          // the whole game document, under its own client collection
          await check({pub: 'landingResult', as: null, args: [f.ended], coll: 'gameresult', source: Games, query: {_id: f.ended}, keys: 'all'});
          await check({pub: 'landingResult', as: null, args: [f.open], coll: 'gameresult', source: Games, query: {_id: f.open}, keys: 'all'});
          await check({pub: 'landingResult', as: null, args: [], error: 400});
        });

        await test('oldResultsTitles and oldResultsDetails: results from the old code base, for anyone', async function() {
          await check({pub: 'oldResultsTitles', as: null, coll: 'oldresults', source: OldResults, query: {},
            keys: ['name', 'results', 'startDate', 'createdAt', 'gameNumber'], nested: {results: ['winner.username']}});
          await check({pub: 'oldResultsDetails', as: null, args: [f.oldResult], coll: 'oldresultsdetails', source: OldResults,
            query: {_id: f.oldResult}, keys: 'all'});
        });

        await test('overallRankingsRegular and overallRankingsPro: ranked users by overall rank, for anyone', async function() {
          await check({pub: 'overallRankingsRegular', as: null, coll: 'overallrankingsregular', source: Meteor.users,
            ids: await idsOf(Meteor.users, {'rankingRegular.numGames': {$gt: 0}, 'rankingRegular.overallRank': {$gt: 0}},
              {sort: {'rankingRegular.overallRank': 1}, limit: 250}),
            keys: ['username', 'rankingRegular']});
          await check({pub: 'overallRankingsPro', as: null, coll: 'overallrankingspro', source: Meteor.users,
            ids: await idsOf(Meteor.users, {'rankingPro.numGames': {$gt: 0}, 'rankingPro.overallRank': {$gt: 0}},
              {sort: {'rankingPro.overallRank': 1}, limit: 250}),
            keys: ['username', 'rankingPro']});
          var regular = await dTest.ddp.connect();
          try {
            await regular.subscribe('overallRankingsRegular');
            var ids = _.pluck(await regular.collection('overallrankingsregular').find().fetchAsync(), '_id');
            assert(_.contains(ids, f.ranked) && _.contains(ids, f.ranked2), 'ranked users are listed');
            assert(!_.contains(ids, f.unranked), 'a user with no games is not');
          } finally {
            regular.close();
          }
        });


        // --- profiles and avatars ---

        await test('userProfile: the user, their finished games and those games, for anyone', async function() {
          await check({pub: 'userProfile', as: null, args: [f.ranked], parts: [
            {coll: 'profileuser', source: Meteor.users, query: {_id: f.ranked}, keys: ['username', 'rankingRegular', 'rankingPro', 'createdAt']},
            {coll: 'players', source: Players, query: {_id: f.playerOver}, keys: ['wonGame', 'gameId', 'rankByIncome', 'rankByVassals', 'userId']},
            {coll: 'games', source: Games, query: {_id: f.ended}, keys: ['endDate', 'hasEnded', 'name', 'numPlayers', 'maxPlayers', 'winningPlayer']}
          ]});
          // a game still being played is not on the profile
          await check({pub: 'userProfile', as: f.ranked, args: [f.plain], parts: [
            {coll: 'profileuser', source: Meteor.users, query: {_id: f.plain}, keys: ['username', 'rankingRegular', 'rankingPro', 'createdAt']},
            {coll: 'players', source: Players, query: {_id: f.playerClosed}, keys: ['wonGame', 'gameId', 'rankByIncome', 'rankByVassals', 'userId']},
            {coll: 'games', source: Games, query: {_id: f.ended}, keys: ['endDate', 'hasEnded', 'name', 'numPlayers', 'maxPlayers', 'winningPlayer']}
          ]});
        });

        await test('userProfile: a missing user id is refused before any query, since Mongo and Meteor disagree on it (was a known bug that wedged the oplog driver)', async function() {
          // With userId undefined the players query would be {userId: undefined,
          // gameIsOver: true}. Mongo drops the undefined and matches every finished
          // player; Meteor's matcher treats it as "userId is missing" and matches
          // none. Subscribed over DDP with oplog on, the oplog driver threw "The
          // Mongo server and the Meteor query disagree" and never became ready, and
          // every method writing to Players then waited forever on its write fence.
          // The publication gate and check() now refuse it first.
          await check({pub: 'userProfile', as: null, args: [], error: 400});
          var sub = {userId: null, connection: null, added: function() {}, changed: function() {}, removed: function() {},
            ready: function() {}, error: function() {}, onStop: function() {}};
          var error = await dTest.throws(function() { return Meteor.server.publish_handlers.userProfile.call(sub); });
          assert(error && (error.errorType == 'Match.Error' || error.error == 400), 'called with no id, the handler throws (got ' + error + ')');

          // the disagreement the checks guard against
          var finished = await Players.findOneAsync(f.playerOver);
          assert(await Players.find({userId: undefined, gameIsOver: true}).countAsync() >= 1, 'Mongo matches the finished players');
          // a local collection runs the same matcher as the oplog driver
          var local = new Mongo.Collection(null);
          await local.insertAsync(finished);
          equal(await local.find({userId: undefined, gameIsOver: true}).countAsync(), 0, 'Meteor\'s matcher matches none of them');
          // a null id is fine: both match nothing
          await check({pub: 'userProfile', as: null, args: [null], parts: [
            {coll: 'profileuser', source: Meteor.users, query: null},
            {coll: 'players', source: Players, query: null},
            {coll: 'games', source: Games, query: null}
          ]});
        });

        await test('userImageForProfile and userImages: avatar file names only, for anyone', async function() {
          await check({pub: 'userImageForProfile', as: null, args: [f.ranked], coll: 'users', source: Meteor.users, query: {_id: f.ranked},
            keys: ['avatarFilename']});
          await check({pub: 'userImageForProfile', as: null, args: [], error: 400});
          await check({pub: 'userImages', as: null, args: [[f.ranked, f.plain, 'nope']], coll: 'users', source: Meteor.users,
            query: {_id: {$in: [f.ranked, f.plain]}}, keys: ['avatarFilename']});
          await check({pub: 'userImages', as: null, args: [[]], coll: 'users', source: Meteor.users, query: null});
          await check({pub: 'userImages', as: null, args: [], error: 400});
          // a logged in caller's own document also arrives, from the null publication
          await check({pub: 'userImages', as: f.plain, args: [[f.ranked]], coll: 'users', source: Meteor.users, query: {_id: f.ranked},
            keys: ['avatarFilename'], skip: [f.plain]});
        });


        // --- forum ---

        await test('forumPinnedTopics: pinned topics, for anyone', async function() {
          await check({pub: 'forumPinnedTopics', as: null, coll: 'forumtopics', source: Forumtopics, query: {isPinned: true}, keys: 'all'});
        });

        await test('forumTopics: unpinned topics by category, filter and sort, for verified users who are not banned', async function() {
          var topics = async function(as, args, ids) {
            await check({pub: 'forumTopics', as: as, args: args, coll: 'forumtopics', source: Forumtopics,
              query: ids === null ? null : undefined, ids: ids, keys: 'all'});
          };
          var unpinned = {isPinned: {$ne: true}};
          await topics(f.plain, ['post', 100, 'all', 'all'], await idsOf(Forumtopics, unpinned, {sort: {lastPostDate: -1}, limit: 100}));
          await topics(f.plain, ['post', 100, 'cat1', 'all'], await idsOf(Forumtopics, _.extend({categoryId: 'cat1'}, unpinned)));
          await topics(f.plain, ['post', 100, 'cat1', 'pastMonth'], await idsOf(Forumtopics, _.extend({categoryId: 'cat1',
            updatedAt: {$gte: daysAgo(30)}}, unpinned)));
          assert(!_.contains(await idsOf(Forumtopics, {updatedAt: {$gte: daysAgo(30)}}), f.topicOld), 'the old topic is outside the month');

          // numShow is a limit on the sorted list
          var sorted = async function(sortBy, field) {
            dTest.ddp.resetRateLimits();
            var client = await dTest.ddp.connect(f.plain);
            try {
              await client.subscribe('forumTopics', sortBy, 2, 'cat1', 'all');
              var got = _.pluck(await client.collection('forumtopics').find().fetchAsync(), '_id').sort();
              var sort = {};
              sort[field] = -1;
              equal(got.join(','), await (await idsOf(Forumtopics, _.extend({categoryId: 'cat1'}, unpinned), {sort: sort, limit: 2})).sort().join(','),
                'the first 2 by ' + field);
            } finally {
              client.close();
            }
          };
          await sorted('post', 'lastPostDate');
          await sorted('topic', 'createdAt');
          await sorted('numPosts', 'numPosts');
          var firstTwo = async function(field) {
            var sort = {};
            sort[field] = -1;
            return await (await idsOf(Forumtopics, {categoryId: 'cat1', isPinned: {$ne: true}}, {sort: sort, limit: 2})).sort().join(',');
          };
          equal(_.uniq([await firstTwo('lastPostDate'), await firstTwo('createdAt'), await firstTwo('numPosts')]).length, 3, 'each sort picks different topics');

          await topics(null, ['post', 100, 'all', 'all'], null);
          await topics(f.unverified, ['post', 100, 'all', 'all'], null);
          await topics(f.banned, ['post', 100, 'all', 'all'], null);
        });

        await test('forumTopic: a topic and its posts, for any logged in user, banned or unverified too', async function() {
          var parts = [
            {coll: 'forumtopics', source: Forumtopics, query: {_id: f.topicNew}, keys: 'all'},
            {coll: 'forumposts', source: Forumposts, query: {topicId: f.topicNew}, keys: 'all'}
          ];
          await dTest.eachAsync([f.plain, f.unverified, f.banned], async function(as) {
            await check({pub: 'forumTopic', as: as, args: [f.topicNew], parts: parts});
          });
          await check({pub: 'forumTopic', as: null, args: [f.topicNew], parts: [
            {coll: 'forumtopics', source: Forumtopics, query: null},
            {coll: 'forumposts', source: Forumposts, query: null}
          ]});
        });


        // --- admin ---

        await test('admin publications: charges, game stats, chat rooms, chats, chat users and reports, for admins only', async function() {
          var adminOnly = [
            {pub: 'admin_charges', coll: 'charges', source: Charges, query: {}},
            {pub: 'admin_gamestats', coll: 'gamestats', source: Gamestats, query: {}},
            {pub: 'admin_chatrooms', coll: 'rooms', source: Rooms, query: {}},
            {pub: 'adminReports', coll: 'reports', source: Reports, ids: await idsOf(Reports, {}, {sort: {createdAt: -1}, limit: 200})},
            {pub: 'adminRoomchats', args: [f.room], coll: 'roomchats', source: Roomchats, query: {room_id: f.room}}
          ];
          await dTest.eachAsync(adminOnly, async function(spec) {
            await check(_.extend({as: f.admin, keys: 'all'}, spec));
            await dTest.eachAsync([null, f.mod, f.plain], async function(as) {
              await check({pub: spec.pub, args: spec.args, as: as, coll: spec.coll, source: spec.source, query: null});
            });
          });
          await check({pub: 'adminChatUsers', as: f.admin, args: [[f.plain, f.ranked]], coll: 'adminchatusers', source: Meteor.users,
            query: {_id: {$in: [f.plain, f.ranked]}}, keys: unitFields});
          await dTest.eachAsync([null, f.mod, f.plain], async function(as) {
            await check({pub: 'adminChatUsers', as: as, args: [[f.plain, f.ranked]], coll: 'adminchatusers', source: Meteor.users, query: null});
          });
        });

        await test('meteor_facts: the server facts go to admins only, and follow a change to admin', async function() {
          // Nothing reports to the old facts package on 2.16 (Meteor's own
          // packages report to facts-base), so there are none unless one is
          // made here
          Package.facts.Facts.incrementServerFact('dTest', 'factsTest', 1);
          var factsFor = async function(userId) {
            dTest.ddp.resetRateLimits();
            var client = await dTest.ddp.connect(userId);
            try {
              client.collection('meteor_Facts_server');
              var sub = await client.subscribe('meteor_facts');
              assert(sub.ready && !sub.error, 'meteor_facts is ready for ' + userId);
              return (await client.docs('meteor_Facts_server')).length;
            } finally {
              client.close();
            }
          };
          assert(await factsFor(f.admin) > 0, 'an admin gets the facts');
          equal(await factsFor(f.mod), 0, 'a moderator gets none');
          equal(await factsFor(f.plain), 0, 'a player gets none');
          equal(await factsFor(null), 0, 'logged out gets none');

          // the filter reads the admins from an observer, so it follows changes
          var later = await account({});
          try {
            equal(await factsFor(later), 0, 'not an admin yet');
            await Meteor.users.updateAsync(later, {$set: {admin: true}});
            assert(await dTest.waitFor(async function() { return await factsFor(later) > 0; }, 5000), 'made an admin: gets the facts');
            await Meteor.users.updateAsync(later, {$set: {admin: false}});
            assert(await dTest.waitFor(async function() { return await factsFor(later) === 0; }, 5000), 'admin: false: none again');
            await Meteor.users.updateAsync(later, {$set: {admin: true}});
            assert(await dTest.waitFor(async function() { return await factsFor(later) > 0; }, 5000), 'admin again');
            await Meteor.users.updateAsync(later, {$unset: {admin: ''}});
            assert(await dTest.waitFor(async function() { return await factsFor(later) === 0; }, 5000), 'admin field removed: none');
          } finally {
            await Meteor.users.removeAsync(later);
          }
        });

        await test('admin_users_online: any caller gets the username and status of users with status.online (known bug)', async function() {
          // there is no admin check, and status is the old user-status field;
          // presence (danimal:userpresence) replaced it
          await dTest.eachAsync([null, f.plain, f.admin], async function(as) {
            await check({pub: 'admin_users_online', as: as, coll: 'users', source: Meteor.users, query: {'status.online': true},
              keys: ['username', 'status'], skip: as ? [as] : []});
          });
          assert(_.contains(await idsOf(Meteor.users, {'status.online': true}), f.statusOnline), 'the fixture user is listed');
        });


        // --- control (admins and moderators) ---

        await test('control publications: games, bans and online users for admins and moderators; moderators and job stats for admins', async function() {
          var staff = [f.admin, f.mod];
          var nobody = [null, f.plain];
          var forStaff = [
            {pub: 'gamesForControl', parts: [{coll: 'games', source: Games, ids: await idsOf(Games, {}, {sort: {createdAt: -1}, limit: 20}), keys: 'all'}]},
            {pub: 'gameForControl', args: [f.open], parts: [
              {coll: 'games', source: Games, query: {_id: f.open}, keys: 'all'},
              {coll: 'gamesignups', source: Gamesignups, query: {gameId: f.open}, keys: 'all'}]},
            {pub: 'control_bans', parts: [{coll: 'users', source: Meteor.users, query: {banned: true},
              keys: ['username', 'banned', 'bannedDate', 'bannedBy', 'reason']}]},
            {pub: 'control_onlineUsers', parts: [{coll: 'users', source: Meteor.users, query: {'presence.status': 'online'},
              keys: ['username', 'presence', 'pro']}]}
          ];
          var forAdmins = [
            {pub: 'control_moderators', parts: [{coll: 'users', source: Meteor.users, query: {moderator: true}, keys: ['username', 'moderator']}]},
            {pub: 'kuestats', parts: [{coll: 'kuestats', source: KueStats, query: {}, keys: 'all'}]}
          ];
          var none = function(spec) {
            return _.extend({}, spec, {parts: spec.parts.map(function(p) { return _.extend({}, p, {query: null, ids: undefined}); })});
          };
          // the caller's own user document comes from the null publication, so leave it out
          var as = function(spec, userId) {
            return _.extend({}, spec, {as: userId, parts: spec.parts.map(function(p) { return _.extend({skip: userId ? [userId] : []}, p); })});
          };
          await dTest.eachAsync(forStaff, async function(spec) {
            await dTest.eachAsync(staff, async function(userId) { await check(as(spec, userId)); });
            await dTest.eachAsync(nobody, async function(userId) { await check(as(none(spec), userId)); });
          });
          await dTest.eachAsync(forAdmins, async function(spec) {
            await check(as(spec, f.admin));
            await dTest.eachAsync([null, f.plain, f.mod], async function(userId) { await check(as(none(spec), userId)); });
          });
          assert(_.contains(await idsOf(Meteor.users, {'presence.status': 'online'}), f.online), 'the online fixture user is listed');
          assert(_.contains(await idsOf(Games, {}, {sort: {createdAt: -1}, limit: 20}), f.open), 'the new game is in the newest 20');
        });

      } finally {
        await dTest.waitForJobs();
        await dTest.eachAsync(made.users, async function(id) { await Meteor.users.removeAsync(id); await Players.removeAsync({userId: id}); await Gamesignups.removeAsync({userId: id}); });
        await dTest.eachAsync(made.games, async function(id) { await Games.removeAsync(id); await Gamesignups.removeAsync({gameId: id}); await Players.removeAsync({gameId: id}); });
        await dTest.eachAsync(made.topics, async function(id) { await Forumtopics.removeAsync(id); await Forumposts.removeAsync({topicId: id}); });
        for (const pair of [[Charges, f.charge], [Gamestats, f.gamestat], [Rooms, f.room], [Roomchats, f.roomchat], [Reports, f.report],
          [KueStats, f.kuestat], [OldResults, f.oldResult]]) {
          if (pair[1]) await pair[0].removeAsync(pair[1]);
        }
        dTest.ddp.resetRateLimits();
      }
    });
  });
}
