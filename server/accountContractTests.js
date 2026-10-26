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
    dTest.addSuite('method contracts: accounts, signups, admin and forum (server/accountContractTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var expectError = dTest.expectError;

      var w = await dTest.buildGameWorld({players: 2});
      var made = {users: [], games: [], topics: [], clients: []};
      var loggedOut = await dTest.ddp.connect();
      made.clients.push(loggedOut);


      // --- Helpers ---

      // a test user and a client logged in as them
      async function person(fields) {
        var user = await dTest.helpers.createTestUser(_.extend({username: 'acct_' + Random.id(6)}, fields || {}));
        made.users.push(user._id);
        var client = await dTest.ddp.connect(user._id);
        made.clients.push(client);
        return {user: user, id: user._id, client: client, doc: async function() { return await Meteor.users.findOneAsync(user._id); }};
      }

      // a game that hasn't started, open for signups
      // a test user with no connection
      async function account(fields) {
        var user = await dTest.helpers.createTestUser(_.extend({username: 'acct_' + Random.id(6)}, fields || {}));
        made.users.push(user._id);
        return user._id;
      }

      async function openGame(fields) {
        var game = await dTest.helpers.createTestGame(_.extend({name: 'Signup ' + Random.id(4),
          startAt: new Date(Date.now() + 1000 * 60 * 60 * 24), maxPlayers: 5}, fields || {}));
        made.games.push(game._id);
        return game;
      }

      async function topic(fields) {
        var id = await Forumtopics.insertAsync(_.extend({title: 'Test topic', categoryId: 1, numPosts: 1, numViews: 0,
          createdAt: new Date(), updatedAt: new Date(), lastPostDate: new Date()}, fields || {}));
        made.topics.push(id);
        return await Forumtopics.findOneAsync(id);
      }

      async function signups(gameId) {
        return await Gamesignups.find({gameId: gameId}).fetchAsync();
      }

      var test = dTest.contractTest(run);


      try {

        // --- public: map and game info, used while spectating ---

        await test('public lookups: map and game info answer a logged out caller', async function() {
          var hex = await Hexes.findOneAsync({gameId: w.gameId});
          equal(await loggedOut.call('coords_to_id', w.gameId, hex.x, hex.y, 'hex'), hex._id, 'coords_to_id finds the hex');
          equal(await loggedOut.call('coords_to_id', w.gameId, 5000, 5000, 'hex'), false, 'no hex there: false');
          equal(await loggedOut.call('coords_to_id', w.gameId, hex.x, hex.y, 'castle'), false, 'other types: false');

          var expected = await dVillages.resourcesFromSurroundingHexes(w.gameId, hex.x, hex.y, _s.villages.num_rings_village);
          equal(JSON.stringify(await loggedOut.call('getResourcesGatheredAtHex', w.gameId, hex.x, hex.y)), JSON.stringify(expected),
            'getResourcesGatheredAtHex');

          equal((await loggedOut.call('getGameInfo', w.gameId))._id, w.gameId, 'getGameInfo returns the game');
          equal(await loggedOut.call('getGameInfo', 'nope'), undefined, 'unknown game: nothing');

          var country = await Countries.findOneAsync({gameId: w.gameId});
          var fetched = await loggedOut.call('fetchCountriesOnScreen', [country._id]);
          equal(fetched.length, 1, 'fetchCountriesOnScreen');
          equal(_.keys(fetched[0]).sort().join(','), _.intersection(_.keys(country), ['_id', 'minX', 'maxX', 'minY', 'maxY',
            'minZ', 'maxZ', 'paths', 'image', 'imageWithCoords']).sort().join(','), 'only the drawing fields');
          await expectError(async function() { return await loggedOut.call('fetchCountriesOnScreen', 'x'); }, 400, null, 'not an array');
        });

        await test('getResourcesGatheredAtHex: a 7th call within 2 seconds is refused with too-many-requests', async function() {
          var hex = await Hexes.findOneAsync({gameId: w.gameId});
          for (var n = 0; n < 6; n++) await loggedOut.call('getResourcesGatheredAtHex', w.gameId, hex.x, hex.y);
          await expectError(async function() { return await loggedOut.call('getResourcesGatheredAtHex', w.gameId, hex.x, hex.y); },
            'too-many-requests', null, '7th call');
        });


        // --- accounts ---

        await test('changeMainUsername: renames the account and its forum topics', async function() {
          var p = await person();
          var tp = await topic({lastPostUserId: p.id, lastPostUsername: p.user.username});
          var newName = 'acctnew_' + Random.id(5).replace(/[^a-zA-Z0-9]/g, 'x');
          await p.client.call('changeMainUsername', newName + '%');
          equal((await p.doc()).username, newName, 'renamed, other characters dropped');
          equal((await Forumtopics.findOneAsync(tp._id)).lastPostUsername, newName, 'forum topic updated');
          var other = await person();
          await expectError(async function() { return await p.client.call('changeMainUsername', other.user.username); },
            'A user exists with this username, try another.', null, 'taken');
          await expectError(async function() { return await p.client.call('changeMainUsername', newName); }, 'You are already named ' + newName, null, 'same');
          await expectError(async function() { return await p.client.call('changeMainUsername', 'a$b'); },
            'New username must be at least 3 characters long.', null, 'too short');
          await expectError(async function() { return await p.client.call('changeMainUsername', 'a'.repeat(26)); }, 'New username is too long.', null, 'too long');
          equal((await p.doc()).username, newName, 'unchanged by refused calls');
        });

        await test('setGender: sets it on the account and everything the account has in games', async function() {
          var userId = w.users[0]._id;
          var client = await dTest.ddp.connect(userId);
          made.clients.push(client);
          var army = await w.makeArmy(0, {footmen: 1});
          try {
            await client.call('setGender', false);
            equal((await Meteor.users.findOneAsync(userId)).male, false, 'account');
            equal((await w.player(0)).male, false, 'player');
            equal((await w.castle(0)).male, false, 'castle');
            equal((await Armies.findOneAsync(army._id)).male, false, 'army');
            await expectError(async function() { return await client.call('setGender', 'no'); }, 400, null, 'not a boolean');
          } finally {
            await client.call('setGender', true);
            await w.removeArmies();
          }
        });

        await test('onEmailVerified: marks the caller\'s email verified without any check (known bug, security audit)', async function() {
          var p = await person({verifiedEmail: false});
          await p.client.call('onEmailVerified');
          equal((await p.doc()).verifiedEmail, true, 'verified with no token');
        });

        await test('avatar and email methods: refused before they reach S3 or email', async function() {
          var p = await person();
          await expectError(async function() { return await p.client.call('uploadAvatarToS3', 'data:', 'image/gif', 10); },
            'Image type must be jpg or png.', null, 'gif');
          await expectError(async function() { return await p.client.call('uploadAvatarToS3', 'data:', 'image/png', 5242881); },
            'Image must be less than 5mb.', null, 'too big');
          equal(await p.client.call('deleteAvatar'), undefined, 'no avatar: nothing to delete');
          await expectError(async function() { return await p.client.call('rensendEmailVerification'); }, 403, null, 'no email address on the account');
          equal((await p.doc()).avatarFilename, undefined, 'no avatar set');
        });

        await test('daysSincePlayerActive: online is 0, otherwise days since last seen', async function() {
          // connecting sets the caller's presence, so the users looked up never connect
          var caller = await person();
          var online = await account({presence: {status: 'online', updatedAt: new Date()}});
          var away = await account({presence: {status: 'offline', updatedAt: new Date(Date.now() - 3.5 * 24 * 60 * 60 * 1000)}});
          equal(await caller.client.call('daysSincePlayerActive', online), 0, 'online');
          equal(await caller.client.call('daysSincePlayerActive', away), 3, 'three and a half days ago');
          equal(await caller.client.call('daysSincePlayerActive', 'nobody'), null, 'unknown user');
        });

        await test('daysSincePlayerActive: a user with no presence fails with an internal error (known bug)', async function() {
          var p = await person();
          var never = await account();
          await expectError(async function() { return await p.client.call('daysSincePlayerActive', never); }, 500, null, 'no presence');
        });

        await test('presence (danimal:userpresence): a connection marks the user online, and closing it marks them offline', async function() {
          var id = await account();
          var first = await dTest.ddp.connect(id);
          made.clients.push(first);
          assert(await dTest.waitFor(async function() {
            var user = await Meteor.users.findOneAsync(id);
            return user.presence && user.presence.status == 'online';
          }, 10000), 'online once connected');
          equal(await UserPresenceSessions.find({userId: id}).countAsync(), 1, 'one session');
          var presence = (await Meteor.users.findOneAsync(id)).presence;
          assert(presence.serverId && presence.updatedAt instanceof Date, 'with the server and the time');
          equal((await UserPresenceSessions.findOneAsync({userId: id})).serverId, presence.serverId, 'the session names the same server');

          // a second connection, then each closed in turn
          var second = await dTest.ddp.connect(id);
          made.clients.push(second);
          assert(await dTest.waitFor(async function() { return await UserPresenceSessions.find({userId: id}).countAsync() == 2; }, 10000), 'two sessions');
          first.close();
          assert(await dTest.waitFor(async function() { return await UserPresenceSessions.find({userId: id}).countAsync() == 1; }, 10000), 'one session left');
          equal((await Meteor.users.findOneAsync(id)).presence.status, 'online', 'still online while one connection is open');
          second.close();
          assert(await dTest.waitFor(async function() {
            return (await Meteor.users.findOneAsync(id)).presence.status == 'offline';
          }, 10000), 'offline once every connection closed');
          equal(await UserPresenceSessions.find({userId: id}).countAsync(), 0, 'no sessions left');

          // a logged-out connection leaves no session
          var before = await UserPresenceSessions.find().countAsync();
          var anon = await dTest.ddp.connect();
          made.clients.push(anon);
          await dTest.sleep(300);
          equal(await UserPresenceSessions.find().countAsync(), before, 'no session for a logged-out client');
          anon.close();
        });

        await test('store checkouts: bad arguments are refused before Stripe is called', async function() {
          var p = await person();
          await expectError(async function() { return await p.client.call('stripeProCheckout', 'singleGame', 'tok'); }, 400, null, 'pro, token not an object');
          await expectError(async function() { return await p.client.call('stripeDonationCheckout', 'lots', {id: 'tok'}); }, 400, null, 'donation, amount not a number');
          await expectError(async function() { return await p.client.call('stripePurchaseCheckout', 100, 'castles', 5, {id: 'tok'}); }, 400, null, 'purchase, id not a string');
          equal(await Charges.find({user_id: p.id}).countAsync(), 0, 'no charges recorded');
        });

        // Stripe is faked: StripeAPI is a global (mrgalaxy:stripe), and the
        // fake answers each charge itself, so nothing leaves the machine
        async function withFakeStripe(refuse, fn) {
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
            await fn(charges);
          } finally {
            global.StripeAPI = original;
          }
          return charges;
        }

        await test('store checkouts: with Stripe faked, a charge records the purchase', async function() {
          var p = await person({proTokens: 0});
          var email = AccountsEmail.extract(await p.doc());
          var player = await Players.insertAsync({gameId: 'acct_game_' + Random.id(4), userId: p.id, username: p.user.username, pro: false});
          try {
            var ids = [];
            var charges = await withFakeStripe(false, async function() {
              ids.push(await p.client.call('stripeProCheckout', 'singleGame', {id: 'tok_1'}));
              equal((await p.doc()).proTokens, 1, 'a single game buys a pro token');
              ids.push(await p.client.call('stripeProCheckout', 'allGames', {id: 'tok_2'}));
              equal((await p.doc()).pro, true, 'all games makes the account pro');
              equal((await Players.findOneAsync(player)).pro, true, 'and its players');
              ids.push(await p.client.call('stripeDonationCheckout', 500, {id: 'tok_3'}));
              ids.push(await p.client.call('stripePurchaseCheckout', 300, 'castles', 'castle_03_skull', {id: 'tok_4'}));
              equal(JSON.stringify((await p.doc()).purchases), '{"castles":["castle_03_skull"]}', 'the castle is bought');
              ids.push(await p.client.call('stripePurchaseCheckout', 300, 'castles', 'no_such_castle', {id: 'tok_5'}));
              equal(JSON.stringify((await p.doc()).purchases), '{"castles":["castle_03_skull"]}', 'an unknown item is charged but not added');
            });

            equal(JSON.stringify(charges.map(function(c) { return [c.amount, c.currency, c.card, c.description === email]; })),
              '[[200,"usd","tok_1",true],[1200,"usd","tok_2",true],[500,"usd","tok_3",true],[300,"usd","tok_4",true],[300,"usd","tok_5",true]]',
              'what Stripe was asked to charge');
            var saved = await Charges.find({user_id: p.id}, {sort: {stripe_charge_id: 1}}).fetchAsync();
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
            await Players.removeAsync(player);
          }
        });

        await test('store checkouts: with Stripe faked, a refused card returns false and changes nothing', async function() {
          var p = await person({proTokens: 0});
          var before = JSON.stringify(_.omit(await p.doc(), 'presence'));
          var results = [];
          var charges = await withFakeStripe(true, async function() {
            results.push(await p.client.call('stripeProCheckout', 'singleGame', {id: 'tok_1'}));
            results.push(await p.client.call('stripeProCheckout', 'allGames', {id: 'tok_2'}));
            results.push(await p.client.call('stripeDonationCheckout', 500, {id: 'tok_3'}));
            results.push(await p.client.call('stripePurchaseCheckout', 300, 'castles', 'castle_03_skull', {id: 'tok_4'}));
          });
          equal(charges.length, 4, 'Stripe was asked four times');
          equal(results.join(), 'false,false,false,false', 'each returns false');
          equal(await Charges.find({user_id: p.id}).countAsync(), 0, 'no charges recorded');
          equal(JSON.stringify(_.omit(await p.doc(), 'presence')), before, 'the account is unchanged');
          var nobody = await withFakeStripe(false, async function() {
            await expectError(async function() { return await loggedOut.call('stripeDonationCheckout', 500, {id: 'tok'}); }, 'not-authorized', null, 'logged out: refused by the method gate');
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

        async function withFakeS3(status, fn) {
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
            await fn(s3);
          } finally {
            dLanding.knox = original;
          }
          return s3;
        }

        await test('uploadAvatarToS3 and deleteAvatar: with S3 faked, the avatar is resized, uploaded and saved, then deleted', async function() {
          if (!imageMagick) return 'skip';
          var p = await person();
          var path = Meteor.settings.public.s3.avatarPath;
          var first, second;
          var s3 = await withFakeS3(200, async function(s3) {
            equal(await p.client.call('uploadAvatarToS3', PNG, 'image/png', PNG.length), true, 'returns true');
            first = (await p.doc()).avatarFilename;
            assert(first && first.indexOf(p.user.username.replace(/\W/g, '')) === 0 && /\.png$/.test(first),
              'named after the user, with the type\'s extension: ' + first);
            equal(s3.deletes.length, 0, 'nothing to delete the first time');

            equal(await p.client.call('uploadAvatarToS3', PNG, 'image/jpeg', PNG.length), true, 'a second upload');
            second = (await p.doc()).avatarFilename;
            assert(second != first && /\.jpg$/.test(second), 'a new name: ' + second);
            equal(JSON.stringify(s3.deletes), JSON.stringify([path + first]), 'the old avatar is deleted');

            equal(await p.client.call('deleteAvatar'), undefined, 'deleteAvatar returns nothing');
            equal((await p.doc()).avatarFilename, null, 'no avatar now');
          });
          equal(JSON.stringify(s3.puts.map(function(put) { return [put.destination, put.headers['Content-Type'], put.headers['Cache-Control']]; })),
            JSON.stringify([[path + first, 'image/jpg', 'max-age=31557600'], [path + second, 'image/jpg', 'max-age=31557600']]), 'what was uploaded');
          assert(s3.puts.every(function(put) { return put.bytes > 0 && put.headers['Content-Length'] === put.bytes; }), 'the resized image, with its length');
          equal(JSON.stringify(s3.deletes), JSON.stringify([path + first, path + second]), 'both deleted in the end');
        });

        // The old avatar is deleted from S3 before the new one is read and
        // uploaded, so when that fails the account still names a file that
        // is gone. The conversion keeps that order.
        await test('known bug: uploadAvatarToS3, with S3 faked: a refused upload or an image that isn\'t one returns false and keeps the avatar\'s name, but deletes its file', async function() {
          if (!imageMagick) return 'skip';
          var p = await person({avatarFilename: 'kept.png'});
          var s3 = await withFakeS3(500, async function() {
            equal(await p.client.call('uploadAvatarToS3', PNG, 'image/png', PNG.length), false, 'S3 refused it: false');
          });
          equal(s3.puts.length, 1, 'it was tried');
          equal((await p.doc()).avatarFilename, 'kept.png', 'the avatar is kept');
          equal(JSON.stringify(s3.deletes), JSON.stringify([Meteor.settings.public.s3.avatarPath + 'kept.png']), 'but its file was deleted first');
          var broken = await withFakeS3(200, async function() {
            var error = console.error;
            console.error = function() {};
            try {
              equal(await p.client.call('uploadAvatarToS3', 'data:image/png;base64,bm90IGFuIGltYWdl', 'image/png', 12), false, 'not an image: false');
            } finally {
              console.error = error;
            }
          });
          equal(broken.puts.length, 0, 'nothing uploaded');
          equal((await p.doc()).avatarFilename, 'kept.png', 'the avatar is still kept');
          equal(broken.deletes.length, 1, 'and its file deleted again');
        });

        await test('addToMailingList job: adds an address once, and a second signup with the same address changes nothing', async function() {
          if (!Queues.addToMailingList.handler) return 'skip';
          var email = 'acct_' + Random.id(6).toLowerCase() + '@example.com';
          try {
            await dTest.runJob('addToMailingList', {name: 'First Name', email: email});
            await dTest.runJob('addToMailingList', {name: 'Second Name', email: email});
            var docs = await MailingList.find({email: email}).fetchAsync();
            equal(docs.length, 1, 'one entry');
            equal(docs[0].name + '|' + docs[0].skip + '|' + (docs[0].added instanceof Date), 'First Name|false|true', 'the first name, not skipped, dated');
          } finally {
            await MailingList.removeAsync({email: email});
          }
        });

        await test('deleteEntireAccount: removes the account and its signups, and leaves every game', async function() {
          var userId = w.users[1]._id;
          var client = await dTest.ddp.connect(userId);
          made.clients.push(client);
          var game = await openGame();
          await Gamesignups.insertAsync({gameId: game._id, userId: userId, username: 'x', createdAt: new Date(), usedToken: false});
          // removing the account logs its connections out, which can drop the
          // reply to this very call; the effects are what count
          var e = await dTest.throws(async function() { return await client.call('deleteEntireAccount'); });
          assert(!e || e.error == 'invocation-failed', 'succeeds, or the reply is lost with the connection (' + (e && e.error) + ')');
          equal(await Meteor.users.find(userId).countAsync(), 0, 'account removed');
          equal(await Gamesignups.find({userId: userId}).countAsync(), 0, 'signups removed');
          assert(await dTest.waitFor(async function() { return !await Players.findOneAsync(w.players[1]._id); }, 30000), 'player removed from the game');
          await dTest.waitForJobs(30000);
        });


        // --- signups and joining ---

        await test('signupForGame and cancelSignupForGame: sign up for a game that hasn\'t started, then cancel', async function() {
          var p = await person();
          var game = await openGame();
          await p.client.call('signupForGame', 'ignored', game._id, '  Signup Name!  ');
          var s = await signups(game._id);
          equal(s.length, 1, 'signed up');
          equal(s[0].userId + '|' + s[0].username + '|' + s[0].usedToken, p.id + '|Signup Name|false', 'signup doc');
          await expectError(async function() { return await p.client.call('signupForGame', 'ignored', game._id, 'Another Name'); },
            'alreadySignedUp', null, 'twice');
          await p.client.call('cancelSignupForGame', 'ignored', game._id);
          equal((await signups(game._id)).length, 0, 'cancelled');
          await expectError(async function() { return await p.client.call('cancelSignupForGame', 'ignored', game._id); }, 'noSignupFound', null, 'nothing to cancel');
        });

        await test('signupForGame: a pro only game uses a token, and cancelling gives it back', async function() {
          var withToken = await person({proTokens: 1});
          var without = await person({proTokens: 0});
          var game = await openGame({isProOnly: true});
          await withToken.client.call('signupForGame', null, game._id, 'Token User');
          equal((await withToken.doc()).proTokens, 0, 'token used');
          equal((await signups(game._id))[0].usedToken, true, 'signup remembers the token');
          await expectError(async function() { return await without.client.call('signupForGame', null, game._id, 'No Token'); }, 'proOnly', null, 'no token');
          await withToken.client.call('cancelSignupForGame', null, game._id);
          equal((await withToken.doc()).proTokens, 1, 'token given back');
        });

        await test('signupForGame: started, unverified, banned, taken name or Danimal is refused', async function() {
          var started = await openGame({startAt: new Date(Date.now() - 60000)});
          var game = await openGame();
          var taken = await person();
          await taken.client.call('signupForGame', null, game._id, 'Taken Name');
          var before = await dTest.snapshot(game._id, [Gamesignups]);
          var p = await person();
          await expectError(async function() { return await p.client.call('signupForGame', null, started._id, 'Late Name'); }, 'gameAlreadyStarted', null, 'started');
          await expectError(async function() { return await p.client.call('signupForGame', null, game._id, 'taken name'); },
            'A user exists with this username, try another.', null, 'taken, any case');
          await expectError(async function() { return await p.client.call('signupForGame', null, game._id, 'Danimal'); }, 'You are not Danimal.', null, 'Danimal');
          await expectError(async function() { return await p.client.call('signupForGame', null, game._id, 'x!'); },
            'Username must be at least 3 characters long.', null, 'too short');
          await expectError(async function() { return await p.client.call('signupForGame', null, 'nope', 'Fine Name'); }, 'noGameFound', null, 'no game');
          var unverified = await person({verifiedEmail: false});
          await expectError(async function() { return await unverified.client.call('signupForGame', null, game._id, 'Unverified'); },
            'Please verify your email before signing up for a game.', null, 'unverified');
          var banned = await person({banned: true});
          await expectError(async function() { return await banned.client.call('signupForGame', null, game._id, 'Banned One'); }, 'banned', null, 'banned');
          await dTest.assertUnchanged(game._id, before, 'a refused signup changed the signups', [Gamesignups]);
        });

        await test('signupForGame: a full game takes one more signup than maxPlayers (known bug: > instead of >=)', async function() {
          var game = await openGame({maxPlayers: 1});
          await (await person()).client.call('signupForGame', null, game._id, 'First In');
          await (await person()).client.call('signupForGame', null, game._id, 'Second In');
          equal((await signups(game._id)).length, 2, 'two signups for one place');
          await expectError(async function() { return await (await person()).client.call('signupForGame', null, game._id, 'Third In'); }, 'maxSignups', null, 'third');
        });

        await test('joinGame: joining a started game creates your player and castle', async function() {
          var p = await person();
          equal(await p.client.call('joinGame', w.gameId, 'Joiner ' + Random.id(3).replace(/[^a-zA-Z0-9]/g, 'x')), undefined, 'returns nothing');
          // the player is inserted before its castle, and castle_id is set last
          assert(await dTest.waitFor(async function() {
            var player = await Players.findOneAsync({gameId: w.gameId, userId: p.id});
            return player && player.castle_id;
          }, 30000), 'player created');
          var player = await Players.findOneAsync({gameId: w.gameId, userId: p.id});
          assert(await Castles.findOneAsync(player.castle_id), 'castle created');
          await dTest.waitForJobs(30000);
          equal(await p.client.call('joinGame', w.gameId), true, 'already in: true');
        });

        await test('joinGame: not started, ended, dominus achieved, unverified or banned is refused', async function() {
          var p = await person();
          var notStarted = await openGame();
          await expectError(async function() { return await p.client.call('joinGame', notStarted._id); }, 'gameNotStarted', null, 'not started');
          var ended = await openGame({hasStarted: true, hasEnded: true});
          await expectError(async function() { return await p.client.call('joinGame', ended._id); }, 'gameEnded', null, 'ended');
          var won = await openGame({hasStarted: true, dominusAchieved: true});
          await expectError(async function() { return await p.client.call('joinGame', won._id); }, 'someoneIsDominus', null, 'dominus');
          await expectError(async function() { return await p.client.call('joinGame', 'nope'); }, 'gameNotFound', null, 'no game');
          await expectError(async function() { return await p.client.call('joinGame', w.gameId, 'a'.repeat(26)); }, 'Username is too long.', null, 'long name');
          var unverified = await person({verifiedEmail: false});
          await expectError(async function() { return await unverified.client.call('joinGame', w.gameId); }, 'nonVerifiedEmail', null, 'unverified');
          var banned = await person({banned: true});
          await expectError(async function() { return await banned.client.call('joinGame', w.gameId); }, 'banned', null, 'banned');
          await dTest.waitForJobs();
          equal(await Players.find({gameId: w.gameId, userId: {$in: [p.id, unverified.id, banned.id]}}).countAsync(), 0, 'nobody joined');
        });


        // --- admin and moderator tools ---

        await test('admin tools: a plain user is refused every one', async function() {
          var p = await person();
          var other = await person();
          var game = await openGame();
          var tp = await topic();
          var before = JSON.stringify([await other.doc(), await Games.findOneAsync(game._id), await Forumtopics.findOneAsync(tp._id), await Settings.findOneAsync()]);
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
          await dTest.eachAsync(refused, async function(r) {
            await expectError(function() { return p.client.applyAsync(r[0], r[1]); }, r[2], null, r[0]);
          });
          // addMod refuses by doing nothing
          equal(await p.client.call('addMod', other.id), undefined, 'addMod: no error');
          equal(JSON.stringify([await other.doc(), await Games.findOneAsync(game._id), await Forumtopics.findOneAsync(tp._id), await Settings.findOneAsync()]), before,
            'nothing changed');
        });

        await test('banUser, unbanUser and addMod: a moderator bans, an admin makes moderators', async function() {
          var admin = await person({admin: true});
          var mod = await person({moderator: true});
          var target = await person();
          await mod.client.call('banUser', target.id, 'spam');
          var doc = await target.doc();
          equal(doc.banned + '|' + doc.reason + '|' + doc.bannedBy, 'true|spam|' + mod.id, 'banned, with reason and who');
          await mod.client.call('unbanUser', target.id);
          equal((await target.doc()).banned, false, 'unbanned');
          await mod.client.call('addMod', target.id);
          equal((await target.doc()).moderator, undefined, 'a moderator can\'t make moderators');
          await admin.client.call('addMod', target.id);
          equal((await target.doc()).moderator, true, 'an admin can');
        });

        await test('addOrEditGame and removeGame: an admin creates, edits and removes a game', async function() {
          var admin = await person({admin: true});
          var gameId = await admin.client.call('addOrEditGame', 'Admin Game', 'a test', 20, '2030-01-02 03:04', true, false, false, true, false, false);
          made.games.push(gameId);
          var game = await Games.findOneAsync(gameId);
          equal(game.name + '|' + game.maxPlayers + '|' + game.isRelaxed + '|' + game.isProOnly, 'Admin Game|20|true|true', 'fields');
          equal(game.startAt.toISOString(), '2030-01-02T03:04:00.000Z', 'start time is UTC');
          equal(game.hasStarted + '|' + game.numPlayers, 'false|0', 'defaults');

          equal(await admin.client.call('addOrEditGame', 'Renamed Game', 'b', 30, '2030-01-02 03:04', false, false, false, false, false, false, gameId),
            gameId, 'edit returns the id');
          equal((await Games.findOneAsync(gameId)).name + '|' + (await Games.findOneAsync(gameId)).maxPlayers, 'Renamed Game|30', 'edited');
          await expectError(async function() {
            return await admin.client.call('addOrEditGame', 'Bad Date', '', 20, '2030/01/02', false, false, false, false, false, false);
          }, 'control.games.addGame', null, 'bad date format');
          await expectError(async function() {
            return await admin.client.call('addOrEditGame', 'X', '', 20, '2030-01-02 03:04', false, false, false, false, false, false);
          }, 'control.games.addGame', null, 'short name');

          await Gamesignups.insertAsync({gameId: gameId, userId: admin.id, username: 'a', createdAt: new Date()});
          await admin.client.call('removeGame', gameId);
          equal(await Games.find(gameId).countAsync(), 0, 'game removed');
          equal(await Gamesignups.find({gameId: gameId}).countAsync(), 0, 'its signups removed');
        });

        await test('landing and control simulations: each is sync, and ends where the real calls do', async function() {
          var admin = await person({admin: true});
          var p = await person({proTokens: 1, male: false});
          var q = await person({verifiedEmail: false});
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
          var real = async function(userId, name, args) {
            await clientOf[userId].call.apply(null, [name].concat(args));
          };
          var title = 'Sim game ' + Random.id(4);
          var newName = 'simname_' + Random.id(5).replace(/[^a-zA-Z0-9]/g, 'x');
          var gameId = async function() { var g = await Games.findOneAsync({name: {$in: [title, title + ' edited']}}); return g && g._id; };
          var tp = await topic({lastPostUserId: p.id, lastPostUsername: p.user.username});
          var state = async function() {
            var id = await gameId();
            var user = async function(u) { return _.pick(await u.doc(), 'username', 'male', 'verifiedEmail', 'proTokens'); };
            return JSON.stringify({
              game: id ? _.omit(await Games.findOneAsync(id), '_id', 'createdAt') : null,
              signups: id ? await Gamesignups.find({gameId: id}).mapAsync(function(s) { return _.omit(s, '_id', 'gameId', 'createdAt'); }) : [],
              p: await user(p), q: await user(q), topic: (await Forumtopics.findOneAsync(tp._id)).lastPostUsername
            });
          };
          var reset = async function() {
            await Meteor.users.updateAsync(p.id, {$set: {username: p.user.username, male: false, proTokens: 1}});
            await Meteor.users.updateAsync(q.id, {$set: {verifiedEmail: false}});
            await Forumtopics.updateAsync(tp._id, {$set: {lastPostUsername: p.user.username}});
          };

          var play = async function(call) {
            await reset();
            await call(admin.id, 'addOrEditGame', [title, 'a test', 20, '2030-01-02 03:04', true, false, false, true, false, false]);
            made.games.push(await gameId());
            await call(p.id, 'signupForGame', [null, await gameId(), '  Sim Signup!  ']);
            await call(p.id, 'changeMainUsername', [newName + '%']);
            await call(p.id, 'setGender', [true]);
            await call(q.id, 'onEmailVerified', []);
            var signedUp = await state();
            await call(p.id, 'cancelSignupForGame', [null, await gameId()]);
            await call(admin.id, 'addOrEditGame', [title + ' edited', 'b', 30, '2030-01-02 03:04', false, false, false, false, false, false, await gameId()]);
            var edited = await state();
            await call(admin.id, 'removeGame', [await gameId()]);
            return [signedUp, edited, await state()];
          };

          var fromServer = await play(real);
          var fromSimulations = await play(simulate);
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
          var refusal = async function(userId, name, args) {
            var error = await dTest.throws(function() { return Meteor.server.method_handlers[name].apply(invocation(userId), args); });
            return error && error.error;
          };
          await reset();
          var game = await openGame();
          equal(await refusal(p.id, 'addOrEditGame', ['Nope', '', 20, '2030-01-02 03:04', false, false, false, false, false, false]),
            'control.games.addGame', 'not a moderator');
          equal(await refusal(p.id, 'removeGame', [game._id]), 'control.games.addGame', 'removing, not a moderator');
          equal(await refusal(p.id, 'signupForGame', [null, 'nope', 'Some Name']), 'noGameFound', 'no game');
          equal(await refusal(q.id, 'signupForGame', [null, game._id, 'Some Name']), 'Please verify your email before signing up for a game.', 'unverified');
          equal(await refusal(p.id, 'signupForGame', [null, game._id, 'x!']), 'Username must be at least 3 characters long.', 'short name');
          equal(await refusal(p.id, 'cancelSignupForGame', [null, game._id]), 'noSignupFound', 'nothing to cancel');
          equal(await refusal(null, 'cancelSignupForGame', [null, game._id]), 'not-authorized', 'logged out');
          equal(await refusal(p.id, 'changeMainUsername', [(await p.doc()).username]), 'You are already named ' + (await p.doc()).username, 'same name');
          assert(await Games.findOneAsync(game._id), 'the game is still there');
          equal(await Gamesignups.find({gameId: game._id}).countAsync(), 0, 'no signups');
        });

        await test('job queue tools: an admin pauses, resumes and runs a job', async function() {
          var admin = await person({admin: true});
          await admin.client.call('pauseJobQueue');
          try {
            var settings = await Settings.findOneAsync();
            equal(settings.isPaused + '|' + settings.manualPause, 'true|true', 'paused, marked as a manual pause');
          } finally {
            await admin.client.call('resumeJobQueue');
          }
          equal((await Settings.findOneAsync()).isPaused, false, 'resumed');
          await KueStats.insertAsync({jobName: 'contractTest', count: 1});
          await admin.client.call('runBullJob', 'resetQueueStats', {});
          assert(await dTest.waitFor(async function() { return !await KueStats.findOneAsync({jobName: 'contractTest'}); }, 15000), 'the job ran');
          equal(await admin.client.call('clearUniqueIdsForJob', 'noSuchJob'), undefined, 'unknown job: nothing');
        });


        // --- forum ---

        await test('forumNewTopic and forumNewPost: a verified user starts a topic and replies', async function() {
          var p = await person();
          var topicId = await p.client.call('forumNewTopic', 'My topic', '2', 'first post');
          made.topics.push(topicId);
          var tp = await Forumtopics.findOneAsync(topicId);
          equal(tp.title + '|' + tp.categoryId + '|' + tp.numPosts + '|' + tp.lastPostUserId, 'My topic|2|1|' + p.id, 'topic');
          equal(await Forumposts.find({topicId: topicId}).countAsync(), 1, 'first post');
          equal(await p.client.call('forumNewPost', topicId, 'a reply'), true, 'reply returns true');
          equal((await Forumtopics.findOneAsync(topicId)).numPosts, 2, 'post count');
          equal(await Forumposts.find({topicId: topicId}).countAsync(), 2, 'two posts');
        });

        await test('forumNewTopic: bad category, empty or long text, unverified or banned is refused', async function() {
          var p = await person();
          var count = await Forumtopics.find().countAsync();
          var newTopic = function(client, title, category, text) {
            return async function() { return await client.call('forumNewTopic', title, category, text); };
          };
          await expectError(newTopic(p.client, 'T', 'false', 'x'), 'Select a category.', null, 'no category');
          await expectError(newTopic(p.client, 'T', '99', 'x'), 'Select a category.', null, 'unknown category');
          await expectError(newTopic(p.client, '', '1', 'x'), 'Title too short.', null, 'empty title');
          await expectError(newTopic(p.client, 'T', '1', ''), 'Text too short.', null, 'empty text');
          await expectError(newTopic(p.client, 'x'.repeat(101), '1', 'x'), 'Title too long, 100 characters max.', null, 'long title');
          await expectError(newTopic(p.client, 'T', '1', 'x'.repeat(5001)), 'Text too long, 5000 characters max.', null, 'long text');
          await expectError(newTopic((await person({verifiedEmail: false})).client, 'T', '1', 'x'), 'No user found.', null, 'unverified');
          await expectError(newTopic((await person({banned: true})).client, 'T', '1', 'x'), 'banned', null, 'banned');
          equal(await Forumtopics.find().countAsync(), count, 'no topics added');
        });

        await test('forumNewPost: posts into a locked topic, and from banned or unverified users (known bug, forum audit)', async function() {
          var tp = await topic({isLocked: true});
          equal(await (await person()).client.call('forumNewPost', tp._id, 'locked?'), true, 'locked topic accepts a post');
          equal(await (await person({banned: true})).client.call('forumNewPost', tp._id, 'banned'), true, 'a banned user can post');
          equal(await (await person({verifiedEmail: false})).client.call('forumNewPost', tp._id, 'unverified'), true, 'an unverified user can post');
          equal(await Forumposts.find({topicId: tp._id}).countAsync(), 3, 'all three saved');
          await expectError(async function() { return await (await person()).client.call('forumNewPost', 'nope', 'x'); }, 'Topic not found.', null, 'no topic');
          await expectError(async function() { return await (await person()).client.call('forumNewPost', tp._id, ''); }, 'Text too short.', null, 'empty');
        });

        await test('forum moderation: a moderator pins, locks and deletes topics', async function() {
          var mod = await person({moderator: true});
          var tp = await topic();
          await mod.client.call('forumPinTopic', tp._id);
          await mod.client.call('forumLockTopic', tp._id);
          equal((await Forumtopics.findOneAsync(tp._id)).isPinned + '|' + (await Forumtopics.findOneAsync(tp._id)).isLocked, 'true|true', 'pinned and locked');
          await mod.client.call('forumUnpinTopic', tp._id);
          await mod.client.call('forumUnlockTopic', tp._id);
          equal((await Forumtopics.findOneAsync(tp._id)).isPinned + '|' + (await Forumtopics.findOneAsync(tp._id)).isLocked, 'false|false', 'unpinned and unlocked');
          await mod.client.call('forumDeleteTopic', tp._id);
          equal(await Forumtopics.find(tp._id).countAsync(), 0, 'deleted');
        });

        await test('forum simulations: each is sync, and ends where the real calls do', async function() {
          var mod = await person({moderator: true});
          var invocation = function(userId, isSimulation) {
            return {userId: userId, isSimulation: isSimulation, connection: null, unblock: function() {}, setUserId: function() {}};
          };
          var simulate = function(name, args) {
            var returned = Meteor.server.method_handlers[name].apply(invocation(mod.id, true), args);
            assert(!dTest.isPromise(returned), name + ': the simulation is sync');
            equal(returned, undefined, name + ' simulation returns nothing');
          };
          var returns = [];
          var real = async function(name, args) {
            returns.push(name + ' ' + JSON.stringify(await mod.client.call.apply(null, [name].concat(args))));
          };
          var title = 'Sim topic ' + Random.id(4);
          var topicId = async function() { return (await Forumtopics.findOneAsync({title: title}))._id; };
          // the topic and its posts, without ids or dates
          var state = async function() {
            var tp = await Forumtopics.findOneAsync({title: title});
            if (!tp) return 'no topic';
            var posts = _.sortBy(await Forumposts.find({topicId: tp._id}).fetchAsync(), 'text');
            return JSON.stringify({
              topic: _.omit(tp, '_id', 'createdAt', 'updatedAt', 'lastPostDate'),
              posts: posts.map(function(p) { return _.omit(p, '_id', 'topicId', 'createdAt'); })
            });
          };

          var play = async function(call) {
            await call('forumNewTopic', [title, '2', 'first post']);
            made.topics.push(await topicId());
            await call('forumNewPost', [await topicId(), 'a reply']);
            await call('addPostView', [await topicId()]);
            await call('forumPinTopic', [await topicId()]);
            await call('forumLockTopic', [await topicId()]);
            var pinned = await state();
            await call('forumUnpinTopic', [await topicId()]);
            await call('forumUnlockTopic', [await topicId()]);
            var unpinned = await state();
            var id = await topicId();
            await call('forumDeleteTopic', [id]);
            var left = await Forumtopics.find({title: title}).countAsync() + ' topics, ' + await Forumposts.find({topicId: id}).countAsync() + ' posts';
            await Forumposts.removeAsync({topicId: id});
            return [pinned, unpinned, left];
          };

          var fromServer = await play(real);
          var fromSimulations = await play(simulate);
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
          var refusal = async function(userId, name, args) {
            var error = await dTest.throws(function() { return Meteor.server.method_handlers[name].apply(invocation(userId, true), args); });
            return error && error.error;
          };
          var tp = await topic();
          var plain = await account();
          equal(await refusal(plain, 'forumPinTopic', [tp._id]), 'forumDeleteTopic', 'not a moderator');
          equal(await refusal(null, 'forumDeleteTopic', [tp._id]), 'forumDeleteTopic', 'logged out');
          equal(await refusal(mod.id, 'forumNewTopic', ['', '1', 'x']), 'Title too short.', 'empty title');
          equal(await refusal(await account({banned: true}), 'forumNewTopic', ['T', '1', 'x']), 'banned', 'banned');
          equal(await refusal(mod.id, 'forumNewPost', ['nope', 'x']), 'Topic not found.', 'no topic');
          equal(await refusal(null, 'forumNewPost', [tp._id, 'x']), 'No user found.', 'logged out post');
          assert(await Forumtopics.findOneAsync(tp._id) && !(await Forumtopics.findOneAsync(tp._id)).isPinned, 'the topic is unchanged');

          // forumMarkAllRead has no simulation: it runs on the server only
          var marked = Meteor.server.method_handlers.forumMarkAllRead.apply(invocation(null, false), []);
          assert(dTest.isPromise(marked), 'forumMarkAllRead is async');
          assert(_.isArray(await marked), 'and lists topic ids');
        });

        await test('addPostView and forumMarkAllRead: work logged out', async function() {
          var recent = await topic();
          var old = await topic({lastPostDate: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000)});
          await loggedOut.call('addPostView', recent._id);
          equal((await Forumtopics.findOneAsync(recent._id)).numViews, 1, 'view counted');
          var ids = await loggedOut.call('forumMarkAllRead');
          assert(_.contains(ids, recent._id), 'a topic posted in recently is listed');
          assert(!_.contains(ids, old._id), 'one older than 15 days is not');
        });

      } finally {
        made.clients.forEach(function(client) { client.close(); });
        await dTest.waitForJobs();
        await dTest.eachAsync(made.users, async function(id) {
          await Meteor.users.removeAsync(id);
          await Gamesignups.removeAsync({userId: id});
          await Forumposts.removeAsync({userId: id});
          await Charges.removeAsync({user_id: id});
          await Players.find({userId: id}).forEachAsync(async function(p) { await Castles.removeAsync({playerId: p._id}); await Players.removeAsync(p._id); });
        });
        await dTest.eachAsync(made.games, async function(id) { await Games.removeAsync(id); await Gamesignups.removeAsync({gameId: id}); });
        await dTest.eachAsync(made.topics, async function(id) { await Forumtopics.removeAsync(id); await Forumposts.removeAsync({topicId: id}); });
        await KueStats.removeAsync({jobName: 'contractTest'});
        await w.cleanup();
        dTest.ddp.resetRateLimits();
      }
    });
  });
}
