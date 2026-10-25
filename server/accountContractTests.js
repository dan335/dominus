// Method contracts: public map lookups, accounts, signups, the store,
// admin tools and the forum (Oct 2026).
//
// Same approach as server/armyContractTests.js: each method is called over a
// real DDP connection, and the tests pin down what a successful call
// changes and that a refused call changes nothing. A test named "known bug"
// describes a bug in today's code. Nothing here reaches Stripe, S3 or
// SendGrid: those methods are only called in ways that stop before them.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    dTest.addSuite('method contracts: accounts, signups, admin and forum (server/accountContractTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var expectError = dTest.expectError;

      var w = dTest.buildGameWorld({players: 2});
      var made = {users: [], games: [], topics: [], clients: []};
      var loggedOut = dTest.ddp.connect();
      made.clients.push(loggedOut);


      // --- Helpers ---

      // a test user and a client logged in as them
      function person(fields) {
        var user = dTest.helpers.createTestUser(_.extend({username: 'acct_' + Random.id(6)}, fields || {}));
        made.users.push(user._id);
        var client = dTest.ddp.connect(user._id);
        made.clients.push(client);
        return {user: user, id: user._id, client: client, doc: function() { return Meteor.users.findOne(user._id); }};
      }

      // a game that hasn't started, open for signups
      // a test user with no connection
      function account(fields) {
        var user = dTest.helpers.createTestUser(_.extend({username: 'acct_' + Random.id(6)}, fields || {}));
        made.users.push(user._id);
        return user._id;
      }

      function openGame(fields) {
        var game = dTest.helpers.createTestGame(_.extend({name: 'Signup ' + Random.id(4),
          startAt: new Date(Date.now() + 1000 * 60 * 60 * 24), maxPlayers: 5}, fields || {}));
        made.games.push(game._id);
        return game;
      }

      function topic(fields) {
        var id = Forumtopics.insert(_.extend({title: 'Test topic', categoryId: 1, numPosts: 1, numViews: 0,
          createdAt: new Date(), updatedAt: new Date(), lastPostDate: new Date()}, fields || {}));
        made.topics.push(id);
        return Forumtopics.findOne(id);
      }

      function signups(gameId) {
        return Gamesignups.find({gameId: gameId}).fetch();
      }

      var test = dTest.contractTest(run);


      try {

        // --- public: map and game info, used while spectating ---

        test('public lookups: map and game info answer a logged out caller', function() {
          var hex = Hexes.findOne({gameId: w.gameId});
          equal(loggedOut.call('coords_to_id', w.gameId, hex.x, hex.y, 'hex'), hex._id, 'coords_to_id finds the hex');
          equal(loggedOut.call('coords_to_id', w.gameId, 5000, 5000, 'hex'), false, 'no hex there: false');
          equal(loggedOut.call('coords_to_id', w.gameId, hex.x, hex.y, 'castle'), false, 'other types: false');

          var expected = dVillages.resourcesFromSurroundingHexes(w.gameId, hex.x, hex.y, _s.villages.num_rings_village);
          equal(JSON.stringify(loggedOut.call('getResourcesGatheredAtHex', w.gameId, hex.x, hex.y)), JSON.stringify(expected),
            'getResourcesGatheredAtHex');

          equal(loggedOut.call('getGameInfo', w.gameId)._id, w.gameId, 'getGameInfo returns the game');
          equal(loggedOut.call('getGameInfo', 'nope'), undefined, 'unknown game: nothing');

          var country = Countries.findOne({gameId: w.gameId});
          var fetched = loggedOut.call('fetchCountriesOnScreen', [country._id]);
          equal(fetched.length, 1, 'fetchCountriesOnScreen');
          equal(_.keys(fetched[0]).sort().join(','), _.intersection(_.keys(country), ['_id', 'minX', 'maxX', 'minY', 'maxY',
            'minZ', 'maxZ', 'paths', 'image', 'imageWithCoords']).sort().join(','), 'only the drawing fields');
          expectError(function() { return loggedOut.call('fetchCountriesOnScreen', 'x'); }, 400, null, 'not an array');
        });

        test('getResourcesGatheredAtHex: a 7th call within 2 seconds is refused with too-many-requests', function() {
          var hex = Hexes.findOne({gameId: w.gameId});
          for (var n = 0; n < 6; n++) loggedOut.call('getResourcesGatheredAtHex', w.gameId, hex.x, hex.y);
          expectError(function() { return loggedOut.call('getResourcesGatheredAtHex', w.gameId, hex.x, hex.y); },
            'too-many-requests', null, '7th call');
        });


        // --- accounts ---

        test('changeMainUsername: renames the account and its forum topics', function() {
          var p = person();
          var tp = topic({lastPostUserId: p.id, lastPostUsername: p.user.username});
          var newName = 'acctnew_' + Random.id(5).replace(/[^a-zA-Z0-9]/g, 'x');
          p.client.call('changeMainUsername', newName + '%');
          equal(p.doc().username, newName, 'renamed, other characters dropped');
          equal(Forumtopics.findOne(tp._id).lastPostUsername, newName, 'forum topic updated');
          var other = person();
          expectError(function() { return p.client.call('changeMainUsername', other.user.username); },
            'A user exists with this username, try another.', null, 'taken');
          expectError(function() { return p.client.call('changeMainUsername', newName); }, 'You are already named ' + newName, null, 'same');
          expectError(function() { return p.client.call('changeMainUsername', 'a$b'); },
            'New username must be at least 3 characters long.', null, 'too short');
          expectError(function() { return p.client.call('changeMainUsername', 'a'.repeat(26)); }, 'New username is too long.', null, 'too long');
          equal(p.doc().username, newName, 'unchanged by refused calls');
        });

        test('setGender: sets it on the account and everything the account has in games', function() {
          var userId = w.users[0]._id;
          var client = dTest.ddp.connect(userId);
          made.clients.push(client);
          var army = w.makeArmy(0, {footmen: 1});
          try {
            client.call('setGender', false);
            equal(Meteor.users.findOne(userId).male, false, 'account');
            equal(w.player(0).male, false, 'player');
            equal(w.castle(0).male, false, 'castle');
            equal(Armies.findOne(army._id).male, false, 'army');
            expectError(function() { return client.call('setGender', 'no'); }, 400, null, 'not a boolean');
          } finally {
            client.call('setGender', true);
            w.removeArmies();
          }
        });

        test('onEmailVerified: marks the caller\'s email verified without any check (known bug, security audit)', function() {
          var p = person({verifiedEmail: false});
          p.client.call('onEmailVerified');
          equal(p.doc().verifiedEmail, true, 'verified with no token');
        });

        test('avatar and email methods: refused before they reach S3 or email', function() {
          var p = person();
          expectError(function() { return p.client.call('uploadAvatarToS3', 'data:', 'image/gif', 10); },
            'Image type must be jpg or png.', null, 'gif');
          expectError(function() { return p.client.call('uploadAvatarToS3', 'data:', 'image/png', 5242881); },
            'Image must be less than 5mb.', null, 'too big');
          equal(p.client.call('deleteAvatar'), undefined, 'no avatar: nothing to delete');
          expectError(function() { return p.client.call('rensendEmailVerification'); }, 403, null, 'no email address on the account');
          equal(p.doc().avatarFilename, undefined, 'no avatar set');
        });

        test('daysSincePlayerActive: online is 0, otherwise days since last seen', function() {
          // connecting sets the caller's presence, so the users looked up never connect
          var caller = person();
          var online = account({presence: {status: 'online', updatedAt: new Date()}});
          var away = account({presence: {status: 'offline', updatedAt: new Date(Date.now() - 3.5 * 24 * 60 * 60 * 1000)}});
          equal(caller.client.call('daysSincePlayerActive', online), 0, 'online');
          equal(caller.client.call('daysSincePlayerActive', away), 3, 'three and a half days ago');
          equal(caller.client.call('daysSincePlayerActive', 'nobody'), null, 'unknown user');
        });

        test('daysSincePlayerActive: a user with no presence fails with an internal error (known bug)', function() {
          var p = person();
          var never = account();
          expectError(function() { return p.client.call('daysSincePlayerActive', never); }, 500, null, 'no presence');
        });

        test('presence (danimal:userpresence): a connection marks the user online, and closing it marks them offline', function() {
          var id = account();
          var first = dTest.ddp.connect(id);
          made.clients.push(first);
          assert(dTest.waitFor(function() {
            var user = Meteor.users.findOne(id);
            return user.presence && user.presence.status == 'online';
          }, 10000), 'online once connected');
          equal(UserPresenceSessions.find({userId: id}).count(), 1, 'one session');
          var presence = Meteor.users.findOne(id).presence;
          assert(presence.serverId && presence.updatedAt instanceof Date, 'with the server and the time');
          equal(UserPresenceSessions.findOne({userId: id}).serverId, presence.serverId, 'the session names the same server');

          // a second connection, then each closed in turn
          var second = dTest.ddp.connect(id);
          made.clients.push(second);
          assert(dTest.waitFor(function() { return UserPresenceSessions.find({userId: id}).count() == 2; }, 10000), 'two sessions');
          first.close();
          assert(dTest.waitFor(function() { return UserPresenceSessions.find({userId: id}).count() == 1; }, 10000), 'one session left');
          equal(Meteor.users.findOne(id).presence.status, 'online', 'still online while one connection is open');
          second.close();
          assert(dTest.waitFor(function() {
            return Meteor.users.findOne(id).presence.status == 'offline';
          }, 10000), 'offline once every connection closed');
          equal(UserPresenceSessions.find({userId: id}).count(), 0, 'no sessions left');

          // a logged-out connection leaves no session
          var before = UserPresenceSessions.find().count();
          var anon = dTest.ddp.connect();
          made.clients.push(anon);
          Meteor._sleepForMs(300);
          equal(UserPresenceSessions.find().count(), before, 'no session for a logged-out client');
          anon.close();
        });

        test('store checkouts: bad arguments are refused before Stripe is called', function() {
          var p = person();
          expectError(function() { return p.client.call('stripeProCheckout', 'singleGame', 'tok'); }, 400, null, 'pro, token not an object');
          expectError(function() { return p.client.call('stripeDonationCheckout', 'lots', {id: 'tok'}); }, 400, null, 'donation, amount not a number');
          expectError(function() { return p.client.call('stripePurchaseCheckout', 100, 'castles', 5, {id: 'tok'}); }, 400, null, 'purchase, id not a string');
          equal(Charges.find({user_id: p.id}).count(), 0, 'no charges recorded');
        });

        test('deleteEntireAccount: removes the account and its signups, and leaves every game', function() {
          var userId = w.users[1]._id;
          var client = dTest.ddp.connect(userId);
          made.clients.push(client);
          var game = openGame();
          Gamesignups.insert({gameId: game._id, userId: userId, username: 'x', createdAt: new Date(), usedToken: false});
          // removing the account logs its connections out, which can drop the
          // reply to this very call; the effects are what count
          var e = dTest.throws(function() { return client.call('deleteEntireAccount'); });
          assert(!e || e.error == 'invocation-failed', 'succeeds, or the reply is lost with the connection (' + (e && e.error) + ')');
          equal(Meteor.users.find(userId).count(), 0, 'account removed');
          equal(Gamesignups.find({userId: userId}).count(), 0, 'signups removed');
          assert(dTest.waitFor(function() { return !Players.findOne(w.players[1]._id); }, 30000), 'player removed from the game');
          dTest.waitForJobs(30000);
        });


        // --- signups and joining ---

        test('signupForGame and cancelSignupForGame: sign up for a game that hasn\'t started, then cancel', function() {
          var p = person();
          var game = openGame();
          p.client.call('signupForGame', 'ignored', game._id, '  Signup Name!  ');
          var s = signups(game._id);
          equal(s.length, 1, 'signed up');
          equal(s[0].userId + '|' + s[0].username + '|' + s[0].usedToken, p.id + '|Signup Name|false', 'signup doc');
          expectError(function() { return p.client.call('signupForGame', 'ignored', game._id, 'Another Name'); },
            'alreadySignedUp', null, 'twice');
          p.client.call('cancelSignupForGame', 'ignored', game._id);
          equal(signups(game._id).length, 0, 'cancelled');
          expectError(function() { return p.client.call('cancelSignupForGame', 'ignored', game._id); }, 'noSignupFound', null, 'nothing to cancel');
        });

        test('signupForGame: a pro only game uses a token, and cancelling gives it back', function() {
          var withToken = person({proTokens: 1});
          var without = person({proTokens: 0});
          var game = openGame({isProOnly: true});
          withToken.client.call('signupForGame', null, game._id, 'Token User');
          equal(withToken.doc().proTokens, 0, 'token used');
          equal(signups(game._id)[0].usedToken, true, 'signup remembers the token');
          expectError(function() { return without.client.call('signupForGame', null, game._id, 'No Token'); }, 'proOnly', null, 'no token');
          withToken.client.call('cancelSignupForGame', null, game._id);
          equal(withToken.doc().proTokens, 1, 'token given back');
        });

        test('signupForGame: started, unverified, banned, taken name or Danimal is refused', function() {
          var started = openGame({startAt: new Date(Date.now() - 60000)});
          var game = openGame();
          var taken = person();
          taken.client.call('signupForGame', null, game._id, 'Taken Name');
          var before = dTest.snapshot(game._id, [Gamesignups]);
          var p = person();
          expectError(function() { return p.client.call('signupForGame', null, started._id, 'Late Name'); }, 'gameAlreadyStarted', null, 'started');
          expectError(function() { return p.client.call('signupForGame', null, game._id, 'taken name'); },
            'A user exists with this username, try another.', null, 'taken, any case');
          expectError(function() { return p.client.call('signupForGame', null, game._id, 'Danimal'); }, 'You are not Danimal.', null, 'Danimal');
          expectError(function() { return p.client.call('signupForGame', null, game._id, 'x!'); },
            'Username must be at least 3 characters long.', null, 'too short');
          expectError(function() { return p.client.call('signupForGame', null, 'nope', 'Fine Name'); }, 'noGameFound', null, 'no game');
          var unverified = person({verifiedEmail: false});
          expectError(function() { return unverified.client.call('signupForGame', null, game._id, 'Unverified'); },
            'Please verify your email before signing up for a game.', null, 'unverified');
          var banned = person({banned: true});
          expectError(function() { return banned.client.call('signupForGame', null, game._id, 'Banned One'); }, 'banned', null, 'banned');
          dTest.assertUnchanged(game._id, before, 'a refused signup changed the signups', [Gamesignups]);
        });

        test('signupForGame: a full game takes one more signup than maxPlayers (known bug: > instead of >=)', function() {
          var game = openGame({maxPlayers: 1});
          person().client.call('signupForGame', null, game._id, 'First In');
          person().client.call('signupForGame', null, game._id, 'Second In');
          equal(signups(game._id).length, 2, 'two signups for one place');
          expectError(function() { return person().client.call('signupForGame', null, game._id, 'Third In'); }, 'maxSignups', null, 'third');
        });

        test('joinGame: joining a started game creates your player and castle', function() {
          var p = person();
          equal(p.client.call('joinGame', w.gameId, 'Joiner ' + Random.id(3).replace(/[^a-zA-Z0-9]/g, 'x')), undefined, 'returns nothing');
          // the player is inserted before its castle, and castle_id is set last
          assert(dTest.waitFor(function() {
            var player = Players.findOne({gameId: w.gameId, userId: p.id});
            return player && player.castle_id;
          }, 30000), 'player created');
          var player = Players.findOne({gameId: w.gameId, userId: p.id});
          assert(Castles.findOne(player.castle_id), 'castle created');
          dTest.waitForJobs(30000);
          equal(p.client.call('joinGame', w.gameId), true, 'already in: true');
        });

        test('joinGame: not started, ended, dominus achieved, unverified or banned is refused', function() {
          var p = person();
          var notStarted = openGame();
          expectError(function() { return p.client.call('joinGame', notStarted._id); }, 'gameNotStarted', null, 'not started');
          var ended = openGame({hasStarted: true, hasEnded: true});
          expectError(function() { return p.client.call('joinGame', ended._id); }, 'gameEnded', null, 'ended');
          var won = openGame({hasStarted: true, dominusAchieved: true});
          expectError(function() { return p.client.call('joinGame', won._id); }, 'someoneIsDominus', null, 'dominus');
          expectError(function() { return p.client.call('joinGame', 'nope'); }, 'gameNotFound', null, 'no game');
          expectError(function() { return p.client.call('joinGame', w.gameId, 'a'.repeat(26)); }, 'Username is too long.', null, 'long name');
          var unverified = person({verifiedEmail: false});
          expectError(function() { return unverified.client.call('joinGame', w.gameId); }, 'nonVerifiedEmail', null, 'unverified');
          var banned = person({banned: true});
          expectError(function() { return banned.client.call('joinGame', w.gameId); }, 'banned', null, 'banned');
          dTest.waitForJobs();
          equal(Players.find({gameId: w.gameId, userId: {$in: [p.id, unverified.id, banned.id]}}).count(), 0, 'nobody joined');
        });


        // --- admin and moderator tools ---

        test('admin tools: a plain user is refused every one', function() {
          var p = person();
          var other = person();
          var game = openGame();
          var tp = topic();
          var before = JSON.stringify([other.doc(), Games.findOne(game._id), Forumtopics.findOne(tp._id), Settings.findOne()]);
          var refused = [
            ['banUser', [other.id, 'reason'], 'control.games.addGame'],
            ['unbanUser', [other.id], 'control.games.addGame'],
            ['addOrEditGame', ['Name', 'desc', 10, '2030-01-01 10:00', false, false, false, false, false, false], 'control.games.addGame'],
            ['removeGame', [game._id], 'control.games.addGame'],
            ['resetQueueStats', [], 'control.resetQueueStats'],
            ['sendToMailingList', ['template'], 'control.games.addGame'],
            ['pauseJobQueue', [], 'not-authorized'],
            ['resumeJobQueue', [], 'not-authorized'],
            ['clearUniqueIdsForJob', ['createPlayer'], 'not-authorized'],
            ['runBullJob', ['resetQueueStats', {}], 'control.games.addGame'],
            ['forumPinTopic', [tp._id], 'forumDeleteTopic'],
            ['forumUnpinTopic', [tp._id], 'forumDeleteTopic'],
            ['forumLockTopic', [tp._id], 'forumDeleteTopic'],
            ['forumUnlockTopic', [tp._id], 'forumDeleteTopic'],
            ['forumDeleteTopic', [tp._id], 'forumDeleteTopic']
          ];
          refused.forEach(function(r) {
            expectError(function() { return p.client.applyAsync(r[0], r[1]); }, r[2], null, r[0]);
          });
          // addMod refuses by doing nothing
          equal(p.client.call('addMod', other.id), undefined, 'addMod: no error');
          equal(JSON.stringify([other.doc(), Games.findOne(game._id), Forumtopics.findOne(tp._id), Settings.findOne()]), before,
            'nothing changed');
        });

        test('banUser, unbanUser and addMod: a moderator bans, an admin makes moderators', function() {
          var admin = person({admin: true});
          var mod = person({moderator: true});
          var target = person();
          mod.client.call('banUser', target.id, 'spam');
          var doc = target.doc();
          equal(doc.banned + '|' + doc.reason + '|' + doc.bannedBy, 'true|spam|' + mod.id, 'banned, with reason and who');
          mod.client.call('unbanUser', target.id);
          equal(target.doc().banned, false, 'unbanned');
          mod.client.call('addMod', target.id);
          equal(target.doc().moderator, undefined, 'a moderator can\'t make moderators');
          admin.client.call('addMod', target.id);
          equal(target.doc().moderator, true, 'an admin can');
        });

        test('addOrEditGame and removeGame: an admin creates, edits and removes a game', function() {
          var admin = person({admin: true});
          var gameId = admin.client.call('addOrEditGame', 'Admin Game', 'a test', 20, '2030-01-02 03:04', true, false, false, true, false, false);
          made.games.push(gameId);
          var game = Games.findOne(gameId);
          equal(game.name + '|' + game.maxPlayers + '|' + game.isRelaxed + '|' + game.isProOnly, 'Admin Game|20|true|true', 'fields');
          equal(game.startAt.toISOString(), '2030-01-02T03:04:00.000Z', 'start time is UTC');
          equal(game.hasStarted + '|' + game.numPlayers, 'false|0', 'defaults');

          equal(admin.client.call('addOrEditGame', 'Renamed Game', 'b', 30, '2030-01-02 03:04', false, false, false, false, false, false, gameId),
            gameId, 'edit returns the id');
          equal(Games.findOne(gameId).name + '|' + Games.findOne(gameId).maxPlayers, 'Renamed Game|30', 'edited');
          expectError(function() {
            return admin.client.call('addOrEditGame', 'Bad Date', '', 20, '2030/01/02', false, false, false, false, false, false);
          }, 'control.games.addGame', null, 'bad date format');
          expectError(function() {
            return admin.client.call('addOrEditGame', 'X', '', 20, '2030-01-02 03:04', false, false, false, false, false, false);
          }, 'control.games.addGame', null, 'short name');

          Gamesignups.insert({gameId: gameId, userId: admin.id, username: 'a', createdAt: new Date()});
          admin.client.call('removeGame', gameId);
          equal(Games.find(gameId).count(), 0, 'game removed');
          equal(Gamesignups.find({gameId: gameId}).count(), 0, 'its signups removed');
        });

        test('job queue tools: an admin pauses, resumes and runs a job', function() {
          var admin = person({admin: true});
          admin.client.call('pauseJobQueue');
          try {
            var settings = Settings.findOne();
            equal(settings.isPaused + '|' + settings.manualPause, 'true|true', 'paused, marked as a manual pause');
          } finally {
            admin.client.call('resumeJobQueue');
          }
          equal(Settings.findOne().isPaused, false, 'resumed');
          KueStats.insert({jobName: 'contractTest', count: 1});
          admin.client.call('runBullJob', 'resetQueueStats', {});
          assert(dTest.waitFor(function() { return !KueStats.findOne({jobName: 'contractTest'}); }, 15000), 'the job ran');
          equal(admin.client.call('clearUniqueIdsForJob', 'noSuchJob'), undefined, 'unknown job: nothing');
        });


        // --- forum ---

        test('forumNewTopic and forumNewPost: a verified user starts a topic and replies', function() {
          var p = person();
          var topicId = p.client.call('forumNewTopic', 'My topic', '2', 'first post');
          made.topics.push(topicId);
          var tp = Forumtopics.findOne(topicId);
          equal(tp.title + '|' + tp.categoryId + '|' + tp.numPosts + '|' + tp.lastPostUserId, 'My topic|2|1|' + p.id, 'topic');
          equal(Forumposts.find({topicId: topicId}).count(), 1, 'first post');
          equal(p.client.call('forumNewPost', topicId, 'a reply'), true, 'reply returns true');
          equal(Forumtopics.findOne(topicId).numPosts, 2, 'post count');
          equal(Forumposts.find({topicId: topicId}).count(), 2, 'two posts');
        });

        test('forumNewTopic: bad category, empty or long text, unverified or banned is refused', function() {
          var p = person();
          var count = Forumtopics.find().count();
          var newTopic = function(client, title, category, text) {
            return function() { return client.call('forumNewTopic', title, category, text); };
          };
          expectError(newTopic(p.client, 'T', 'false', 'x'), 'Select a category.', null, 'no category');
          expectError(newTopic(p.client, 'T', '99', 'x'), 'Select a category.', null, 'unknown category');
          expectError(newTopic(p.client, '', '1', 'x'), 'Title too short.', null, 'empty title');
          expectError(newTopic(p.client, 'T', '1', ''), 'Text too short.', null, 'empty text');
          expectError(newTopic(p.client, 'x'.repeat(101), '1', 'x'), 'Title too long, 100 characters max.', null, 'long title');
          expectError(newTopic(p.client, 'T', '1', 'x'.repeat(5001)), 'Text too long, 5000 characters max.', null, 'long text');
          expectError(newTopic(person({verifiedEmail: false}).client, 'T', '1', 'x'), 'No user found.', null, 'unverified');
          expectError(newTopic(person({banned: true}).client, 'T', '1', 'x'), 'banned', null, 'banned');
          equal(Forumtopics.find().count(), count, 'no topics added');
        });

        test('forumNewPost: posts into a locked topic, and from banned or unverified users (known bug, forum audit)', function() {
          var tp = topic({isLocked: true});
          equal(person().client.call('forumNewPost', tp._id, 'locked?'), true, 'locked topic accepts a post');
          equal(person({banned: true}).client.call('forumNewPost', tp._id, 'banned'), true, 'a banned user can post');
          equal(person({verifiedEmail: false}).client.call('forumNewPost', tp._id, 'unverified'), true, 'an unverified user can post');
          equal(Forumposts.find({topicId: tp._id}).count(), 3, 'all three saved');
          expectError(function() { return person().client.call('forumNewPost', 'nope', 'x'); }, 'Topic not found.', null, 'no topic');
          expectError(function() { return person().client.call('forumNewPost', tp._id, ''); }, 'Text too short.', null, 'empty');
        });

        test('forum moderation: a moderator pins, locks and deletes topics', function() {
          var mod = person({moderator: true});
          var tp = topic();
          mod.client.call('forumPinTopic', tp._id);
          mod.client.call('forumLockTopic', tp._id);
          equal(Forumtopics.findOne(tp._id).isPinned + '|' + Forumtopics.findOne(tp._id).isLocked, 'true|true', 'pinned and locked');
          mod.client.call('forumUnpinTopic', tp._id);
          mod.client.call('forumUnlockTopic', tp._id);
          equal(Forumtopics.findOne(tp._id).isPinned + '|' + Forumtopics.findOne(tp._id).isLocked, 'false|false', 'unpinned and unlocked');
          mod.client.call('forumDeleteTopic', tp._id);
          equal(Forumtopics.find(tp._id).count(), 0, 'deleted');
        });

        test('forum simulations: each is sync, and ends where the real calls do', function() {
          var mod = person({moderator: true});
          var invocation = function(userId, isSimulation) {
            return {userId: userId, isSimulation: isSimulation, connection: null, unblock: function() {}, setUserId: function() {}};
          };
          var simulate = function(name, args) {
            var returned = Meteor.server.method_handlers[name].apply(invocation(mod.id, true), args);
            assert(!dTest.isPromise(returned), name + ': the simulation is sync');
            equal(returned, undefined, name + ' simulation returns nothing');
          };
          var returns = [];
          var real = function(name, args) {
            returns.push(name + ' ' + JSON.stringify(mod.client.call.apply(null, [name].concat(args))));
          };
          var title = 'Sim topic ' + Random.id(4);
          var topicId = function() { return Forumtopics.findOne({title: title})._id; };
          // the topic and its posts, without ids or dates
          var state = function() {
            var tp = Forumtopics.findOne({title: title});
            if (!tp) return 'no topic';
            var posts = _.sortBy(Forumposts.find({topicId: tp._id}).fetch(), 'text');
            return JSON.stringify({
              topic: _.omit(tp, '_id', 'createdAt', 'updatedAt', 'lastPostDate'),
              posts: posts.map(function(p) { return _.omit(p, '_id', 'topicId', 'createdAt'); })
            });
          };

          var play = function(call) {
            call('forumNewTopic', [title, '2', 'first post']);
            made.topics.push(topicId());
            call('forumNewPost', [topicId(), 'a reply']);
            call('addPostView', [topicId()]);
            call('forumPinTopic', [topicId()]);
            call('forumLockTopic', [topicId()]);
            var pinned = state();
            call('forumUnpinTopic', [topicId()]);
            call('forumUnlockTopic', [topicId()]);
            var unpinned = state();
            var id = topicId();
            call('forumDeleteTopic', [id]);
            var left = Forumtopics.find({title: title}).count() + ' topics, ' + Forumposts.find({topicId: id}).count() + ' posts';
            Forumposts.remove({topicId: id});
            return [pinned, unpinned, left];
          };

          var fromServer = play(real);
          var fromSimulations = play(simulate);
          equal(fromSimulations[0], fromServer[0], 'after posting, pinning and locking');
          equal(fromSimulations[1], fromServer[1], 'after unpinning and unlocking');
          equal(fromSimulations[2], fromServer[2], 'after deleting');
          var pinned = JSON.parse(fromServer[0]);
          equal([pinned.topic.numPosts, pinned.topic.numViews, pinned.topic.isPinned, pinned.topic.isLocked].join(), '2,1,true,true',
            'posts, views, pinned and locked');
          equal(fromServer[2], '0 topics, 2 posts', 'deleting a topic leaves its posts');
          equal(returns.slice(1).join('; '), 'forumNewPost true; addPostView undefined; forumPinTopic undefined; ' +
            'forumLockTopic undefined; forumUnpinTopic undefined; forumUnlockTopic undefined; forumDeleteTopic undefined',
            'what the real calls return');
          assert(/^forumNewTopic "[^"]+"$/.test(returns[0]), 'forumNewTopic returns the topic id');

          // refused simulations throw, as the real calls do
          var refusal = function(userId, name, args) {
            var error = dTest.throws(function() { return Meteor.server.method_handlers[name].apply(invocation(userId, true), args); });
            return error && error.error;
          };
          var tp = topic();
          var plain = account();
          equal(refusal(plain, 'forumPinTopic', [tp._id]), 'forumDeleteTopic', 'not a moderator');
          equal(refusal(null, 'forumDeleteTopic', [tp._id]), 'forumDeleteTopic', 'logged out');
          equal(refusal(mod.id, 'forumNewTopic', ['', '1', 'x']), 'Title too short.', 'empty title');
          equal(refusal(account({banned: true}), 'forumNewTopic', ['T', '1', 'x']), 'banned', 'banned');
          equal(refusal(mod.id, 'forumNewPost', ['nope', 'x']), 'Topic not found.', 'no topic');
          equal(refusal(null, 'forumNewPost', [tp._id, 'x']), 'No user found.', 'logged out post');
          assert(Forumtopics.findOne(tp._id) && !Forumtopics.findOne(tp._id).isPinned, 'the topic is unchanged');

          // forumMarkAllRead has no simulation: it runs on the server only
          var marked = Meteor.server.method_handlers.forumMarkAllRead.apply(invocation(null, false), []);
          assert(dTest.isPromise(marked), 'forumMarkAllRead is async');
          assert(_.isArray(dTest.settle(marked)), 'and lists topic ids');
        });

        test('addPostView and forumMarkAllRead: work logged out', function() {
          var recent = topic();
          var old = topic({lastPostDate: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000)});
          loggedOut.call('addPostView', recent._id);
          equal(Forumtopics.findOne(recent._id).numViews, 1, 'view counted');
          var ids = loggedOut.call('forumMarkAllRead');
          assert(_.contains(ids, recent._id), 'a topic posted in recently is listed');
          assert(!_.contains(ids, old._id), 'one older than 15 days is not');
        });

      } finally {
        made.clients.forEach(function(client) { client.close(); });
        dTest.waitForJobs();
        made.users.forEach(function(id) {
          Meteor.users.remove(id);
          Gamesignups.remove({userId: id});
          Forumposts.remove({userId: id});
          Charges.remove({user_id: id});
          Players.find({userId: id}).forEach(function(p) { Castles.remove({playerId: p._id}); Players.remove(p._id); });
        });
        made.games.forEach(function(id) { Games.remove(id); Gamesignups.remove({gameId: id}); });
        made.topics.forEach(function(id) { Forumtopics.remove(id); Forumposts.remove({topicId: id}); });
        KueStats.remove({jobName: 'contractTest'});
        w.cleanup();
        dTest.ddp.resetRateLimits();
      }
    });
  });
}
