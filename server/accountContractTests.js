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

          var expected = dTest.settle(dVillages.resourcesFromSurroundingHexes(w.gameId, hex.x, hex.y, _s.villages.num_rings_village));
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

        // Stripe is faked: StripeAPI is a global (mrgalaxy:stripe), and the
        // fake answers each charge itself, so nothing leaves the machine
        function withFakeStripe(refuse, fn) {
          var charges = [];
          var original = global.StripeAPI;
          global.StripeAPI = function(key) {
            return {charges: {create: function(options, callback) {
              charges.push(options);
              setTimeout(function() {
                if (refuse) callback(new Error('test: card declined'));
                else callback(null, {id: 'ch_fake_' + charges.length, livemode: false});
              }, 5);
            }}};
          };
          try {
            fn(charges);
          } finally {
            global.StripeAPI = original;
          }
          return charges;
        }

        test('store checkouts: with Stripe faked, a charge records the purchase', function() {
          var p = person({proTokens: 0});
          var email = AccountsEmail.extract(p.doc());
          var player = Players.insert({gameId: 'acct_game_' + Random.id(4), userId: p.id, username: p.user.username, pro: false});
          try {
            var ids = [];
            var charges = withFakeStripe(false, function() {
              ids.push(p.client.call('stripeProCheckout', 'singleGame', {id: 'tok_1'}));
              equal(p.doc().proTokens, 1, 'a single game buys a pro token');
              ids.push(p.client.call('stripeProCheckout', 'allGames', {id: 'tok_2'}));
              equal(p.doc().pro, true, 'all games makes the account pro');
              equal(Players.findOne(player).pro, true, 'and its players');
              ids.push(p.client.call('stripeDonationCheckout', 500, {id: 'tok_3'}));
              ids.push(p.client.call('stripePurchaseCheckout', 300, 'castles', 'castle_03_skull', {id: 'tok_4'}));
              equal(JSON.stringify(p.doc().purchases), '{"castles":["castle_03_skull"]}', 'the castle is bought');
              ids.push(p.client.call('stripePurchaseCheckout', 300, 'castles', 'no_such_castle', {id: 'tok_5'}));
              equal(JSON.stringify(p.doc().purchases), '{"castles":["castle_03_skull"]}', 'an unknown item is charged but not added');
            });

            equal(JSON.stringify(charges.map(function(c) { return [c.amount, c.currency, c.card, c.description === email]; })),
              '[[200,"usd","tok_1",true],[1200,"usd","tok_2",true],[500,"usd","tok_3",true],[300,"usd","tok_4",true],[300,"usd","tok_5",true]]',
              'what Stripe was asked to charge');
            var saved = Charges.find({user_id: p.id}, {sort: {stripe_charge_id: 1}}).fetch();
            equal(JSON.stringify(_.pluck(saved, '_id').sort()), JSON.stringify(ids.slice().sort()), 'each call returns its charge id');
            equal(JSON.stringify(saved.map(function(c) {
              return [c.stripe_charge_id, c.type, c.amount, c.storeType || null, c.storeId || null, c.user_email === email,
                c.user_username === p.user.username, c.livemode];
            })), JSON.stringify([
              ['ch_fake_1', 'pro_singleGame_purchase', 200, null, null, true, true, false],
              ['ch_fake_2', 'pro_allGames_purchase', 1200, null, null, true, true, false],
              ['ch_fake_3', 'donation', 500, null, null, true, true, false],
              ['ch_fake_4', 'store_purchase', 300, 'castles', 'castle_03_skull', true, true, false],
              ['ch_fake_5', 'store_purchase', 300, 'castles', 'no_such_castle', true, true, false]
            ]), 'the charges recorded');
          } finally {
            Players.remove(player);
          }
        });

        test('store checkouts: with Stripe faked, a refused card returns false and changes nothing', function() {
          var p = person({proTokens: 0});
          var before = JSON.stringify(_.omit(p.doc(), 'presence'));
          var results = [];
          var charges = withFakeStripe(true, function() {
            results.push(p.client.call('stripeProCheckout', 'singleGame', {id: 'tok_1'}));
            results.push(p.client.call('stripeProCheckout', 'allGames', {id: 'tok_2'}));
            results.push(p.client.call('stripeDonationCheckout', 500, {id: 'tok_3'}));
            results.push(p.client.call('stripePurchaseCheckout', 300, 'castles', 'castle_03_skull', {id: 'tok_4'}));
          });
          equal(charges.length, 4, 'Stripe was asked four times');
          equal(results.join(), 'false,false,false,false', 'each returns false');
          equal(Charges.find({user_id: p.id}).count(), 0, 'no charges recorded');
          equal(JSON.stringify(_.omit(p.doc(), 'presence')), before, 'the account is unchanged');
          var nobody = withFakeStripe(false, function() {
            expectError(function() { return loggedOut.call('stripeDonationCheckout', 500, {id: 'tok'}); }, 'not-authorized', null, 'logged out: refused by the method gate');
          });
          equal(nobody.length, 0, 'a logged out caller never reaches Stripe');
        });

        // S3 is faked: dLanding.knox is replaced by a client that answers
        // each upload itself. The resize runs ImageMagick, so the test needs it.
        var imageMagick = (function() {
          try {
            return Npm.require('child_process').spawnSync('convert', ['-version']).status === 0;
          } catch (e) {
            return false;
          }
        })();
        // a 2x2 red PNG
        var PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==';

        function withFakeS3(status, fn) {
          var s3 = {puts: [], deletes: []};
          var original = dLanding.knox;
          dLanding.knox = {
            put: function(destination, headers) {
              var put = {destination: destination, headers: headers, bytes: null};
              s3.puts.push(put);
              var onResponse = null;
              return {
                on: function(event, fn) { if (event == 'response') onResponse = fn; },
                end: function(buffer) {
                  put.bytes = buffer.length;
                  setTimeout(function() { onResponse({statusCode: status}); }, 5);
                }
              };
            },
            deleteFile: function(file, callback) {
              s3.deletes.push(file);
              setTimeout(function() { callback(null, {statusCode: 204}); }, 5);
            }
          };
          try {
            fn(s3);
          } finally {
            dLanding.knox = original;
          }
          return s3;
        }

        test('uploadAvatarToS3 and deleteAvatar: with S3 faked, the avatar is resized, uploaded and saved, then deleted', function() {
          if (!imageMagick) return 'skip';
          var p = person();
          var path = Meteor.settings.public.s3.avatarPath;
          var first, second;
          var s3 = withFakeS3(200, function(s3) {
            equal(p.client.call('uploadAvatarToS3', PNG, 'image/png', PNG.length), true, 'returns true');
            first = p.doc().avatarFilename;
            assert(first && first.indexOf(p.user.username.replace(/\W/g, '')) === 0 && /\.png$/.test(first),
              'named after the user, with the type\'s extension: ' + first);
            equal(s3.deletes.length, 0, 'nothing to delete the first time');

            equal(p.client.call('uploadAvatarToS3', PNG, 'image/jpeg', PNG.length), true, 'a second upload');
            second = p.doc().avatarFilename;
            assert(second != first && /\.jpg$/.test(second), 'a new name: ' + second);
            equal(JSON.stringify(s3.deletes), JSON.stringify([path + first]), 'the old avatar is deleted');

            equal(p.client.call('deleteAvatar'), undefined, 'deleteAvatar returns nothing');
            equal(p.doc().avatarFilename, null, 'no avatar now');
          });
          equal(JSON.stringify(s3.puts.map(function(put) { return [put.destination, put.headers['Content-Type'], put.headers['Cache-Control']]; })),
            JSON.stringify([[path + first, 'image/jpg', 'max-age=31557600'], [path + second, 'image/jpg', 'max-age=31557600']]), 'what was uploaded');
          assert(s3.puts.every(function(put) { return put.bytes > 0 && put.headers['Content-Length'] === put.bytes; }), 'the resized image, with its length');
          equal(JSON.stringify(s3.deletes), JSON.stringify([path + first, path + second]), 'both deleted in the end');
        });

        // The old avatar is deleted from S3 before the new one is read and
        // uploaded, so when that fails the account still names a file that
        // is gone. The conversion keeps that order.
        test('known bug: uploadAvatarToS3, with S3 faked: a refused upload or an image that isn\'t one returns false and keeps the avatar\'s name, but deletes its file', function() {
          if (!imageMagick) return 'skip';
          var p = person({avatarFilename: 'kept.png'});
          var s3 = withFakeS3(500, function() {
            equal(p.client.call('uploadAvatarToS3', PNG, 'image/png', PNG.length), false, 'S3 refused it: false');
          });
          equal(s3.puts.length, 1, 'it was tried');
          equal(p.doc().avatarFilename, 'kept.png', 'the avatar is kept');
          equal(JSON.stringify(s3.deletes), JSON.stringify([Meteor.settings.public.s3.avatarPath + 'kept.png']), 'but its file was deleted first');
          var broken = withFakeS3(200, function() {
            var error = console.error;
            console.error = function() {};
            try {
              equal(p.client.call('uploadAvatarToS3', 'data:image/png;base64,bm90IGFuIGltYWdl', 'image/png', 12), false, 'not an image: false');
            } finally {
              console.error = error;
            }
          });
          equal(broken.puts.length, 0, 'nothing uploaded');
          equal(p.doc().avatarFilename, 'kept.png', 'the avatar is still kept');
          equal(broken.deletes.length, 1, 'and its file deleted again');
        });

        test('addToMailingList job: adds an address once, and a second signup with the same address changes nothing', function() {
          if (!Queues.addToMailingList.handler) return 'skip';
          var email = 'acct_' + Random.id(6).toLowerCase() + '@example.com';
          try {
            dTest.runJob('addToMailingList', {name: 'First Name', email: email});
            dTest.runJob('addToMailingList', {name: 'Second Name', email: email});
            var docs = MailingList.find({email: email}).fetch();
            equal(docs.length, 1, 'one entry');
            equal(docs[0].name + '|' + docs[0].skip + '|' + (docs[0].added instanceof Date), 'First Name|false|true', 'the first name, not skipped, dated');
          } finally {
            MailingList.remove({email: email});
          }
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

        test('landing and control simulations: each is sync, and ends where the real calls do', function() {
          var admin = person({admin: true});
          var p = person({proTokens: 1, male: false});
          var q = person({verifiedEmail: false});
          var invocation = function(userId) {
            return {userId: userId, isSimulation: true, connection: null, unblock: function() {}, setUserId: function() {}};
          };
          var clientOf = {};
          clientOf[admin.id] = admin.client;
          clientOf[p.id] = p.client;
          clientOf[q.id] = q.client;
          var simulate = function(userId, name, args) {
            var returned = Meteor.server.method_handlers[name].apply(invocation(userId), args);
            assert(!dTest.isPromise(returned), name + ': the simulation is sync');
            equal(returned, undefined, name + ' simulation returns nothing');
          };
          var real = function(userId, name, args) {
            clientOf[userId].call.apply(null, [name].concat(args));
          };
          var title = 'Sim game ' + Random.id(4);
          var newName = 'simname_' + Random.id(5).replace(/[^a-zA-Z0-9]/g, 'x');
          var gameId = function() { var g = Games.findOne({name: {$in: [title, title + ' edited']}}); return g && g._id; };
          var tp = topic({lastPostUserId: p.id, lastPostUsername: p.user.username});
          var state = function() {
            var id = gameId();
            var user = function(u) { return _.pick(u.doc(), 'username', 'male', 'verifiedEmail', 'proTokens'); };
            return JSON.stringify({
              game: id ? _.omit(Games.findOne(id), '_id', 'createdAt') : null,
              signups: id ? Gamesignups.find({gameId: id}).map(function(s) { return _.omit(s, '_id', 'gameId', 'createdAt'); }) : [],
              p: user(p), q: user(q), topic: Forumtopics.findOne(tp._id).lastPostUsername
            });
          };
          var reset = function() {
            Meteor.users.update(p.id, {$set: {username: p.user.username, male: false, proTokens: 1}});
            Meteor.users.update(q.id, {$set: {verifiedEmail: false}});
            Forumtopics.update(tp._id, {$set: {lastPostUsername: p.user.username}});
          };

          var play = function(call) {
            reset();
            call(admin.id, 'addOrEditGame', [title, 'a test', 20, '2030-01-02 03:04', true, false, false, true, false, false]);
            made.games.push(gameId());
            call(p.id, 'signupForGame', [null, gameId(), '  Sim Signup!  ']);
            call(p.id, 'changeMainUsername', [newName + '%']);
            call(p.id, 'setGender', [true]);
            call(q.id, 'onEmailVerified', []);
            var signedUp = state();
            call(p.id, 'cancelSignupForGame', [null, gameId()]);
            call(admin.id, 'addOrEditGame', [title + ' edited', 'b', 30, '2030-01-02 03:04', false, false, false, false, false, false, gameId()]);
            var edited = state();
            call(admin.id, 'removeGame', [gameId()]);
            return [signedUp, edited, state()];
          };

          var fromServer = play(real);
          var fromSimulations = play(simulate);
          equal(fromSimulations[0], fromServer[0], 'after making a game, signing up and changing the account');
          equal(fromSimulations[1], fromServer[1], 'after cancelling and editing');
          equal(fromSimulations[2], fromServer[2], 'after removing the game');
          var signedUp = JSON.parse(fromServer[0]);
          equal(JSON.stringify(signedUp.signups), JSON.stringify([{userId: p.id, username: 'Sim Signup', usedToken: true}]), 'the signup used a token');
          equal(JSON.stringify(signedUp.p), JSON.stringify({username: newName, male: true, verifiedEmail: true, proTokens: 0}), 'renamed, male, token spent');
          equal(signedUp.q.verifiedEmail + '|' + signedUp.topic, 'true|' + newName, 'verified, topic renamed');
          var edited = JSON.parse(fromServer[1]);
          equal(edited.game.name + '|' + edited.game.maxPlayers + '|' + edited.p.proTokens + '|' + edited.signups.length,
            title + ' edited|30|1|0', 'edited, the token given back');
          equal(JSON.parse(fromServer[2]).game, null, 'removed');

          // refused simulations throw, as the real calls do
          var refusal = function(userId, name, args) {
            var error = dTest.throws(function() { return Meteor.server.method_handlers[name].apply(invocation(userId), args); });
            return error && error.error;
          };
          reset();
          var game = openGame();
          equal(refusal(p.id, 'addOrEditGame', ['Nope', '', 20, '2030-01-02 03:04', false, false, false, false, false, false]),
            'control.games.addGame', 'not a moderator');
          equal(refusal(p.id, 'removeGame', [game._id]), 'control.games.addGame', 'removing, not a moderator');
          equal(refusal(p.id, 'signupForGame', [null, 'nope', 'Some Name']), 'noGameFound', 'no game');
          equal(refusal(q.id, 'signupForGame', [null, game._id, 'Some Name']), 'Please verify your email before signing up for a game.', 'unverified');
          equal(refusal(p.id, 'signupForGame', [null, game._id, 'x!']), 'Username must be at least 3 characters long.', 'short name');
          equal(refusal(p.id, 'cancelSignupForGame', [null, game._id]), 'noSignupFound', 'nothing to cancel');
          equal(refusal(null, 'cancelSignupForGame', [null, game._id]), 'not-authorized', 'logged out');
          equal(refusal(p.id, 'changeMainUsername', [p.doc().username]), 'You are already named ' + p.doc().username, 'same name');
          assert(Games.findOne(game._id), 'the game is still there');
          equal(Gamesignups.find({gameId: game._id}).count(), 0, 'no signups');
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
