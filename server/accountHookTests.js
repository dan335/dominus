// The accounts hooks in server/accounts.js (upgrade PR 17, Oct 2026):
// onCreateUser sets up every new account, validateNewUser refuses one with no
// email, and onLogin clears isNewUser and carries pro over from the old
// server's OldProUsers. These sign up and log in the way the browser does,
// over a real DDP connection, and make Google and Facebook accounts the way
// their login handlers do, through Accounts.updateOrCreateUserFromExternalService
// (signing in with the real services is Daniel's smoke test).
//
// The mailing list job each signup queues is recorded, not run, and the
// verification email is caught before it is sent.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the same rule
// applies: only against a local development database.

if (Meteor.isServer) {

  var crypto = Npm.require('crypto');

  Meteor.startup(function() {
    dTest.addSuite('accounts hooks (server/accountHookTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var test = dTest.contractTest(run);

      var PASSWORD = 'acct hook password';
      var userIds = [];
      var playerIds = [];
      var oldProIds = [];
      var clients = [];

      var name = function(prefix) {
        return prefix + Random.id(5).toLowerCase();
      };

      // what the browser sends for a password (accounts-password hashes it)
      var hashed = function(password) {
        return {digest: crypto.createHash('sha256').update(password).digest('hex'), algorithm: 'sha-256'};
      };

      var connect = async function(userId) {
        var client = await dTest.ddp.connect(userId);
        clients.push(client);
        return client;
      };

      var user = async function(userId) {
        return await Meteor.users.findOneAsync(userId);
      };

      var keep = function(userId) {
        if (userId) userIds.push(userId);
        return userId;
      };

      // runs fn with the verification email caught; returns {jobs, emails}
      var signingUp = async function(fn) {
        var emails = [];
        var send = Accounts.sendVerificationEmail;
        Accounts.sendVerificationEmail = function(userId, address) { emails.push([userId, address]); };
        try {
          var jobs = await dTest.recordJobs(async function() { await fn(); });
          return {jobs: jobs, emails: emails};
        } finally {
          Accounts.sendVerificationEmail = send;
        }
      };

      // console.error while fn runs, collected instead of printed
      var quietErrors = async function(fn) {
        var errors = [];
        var error = console.error;
        console.error = function() { errors.push(_.toArray(arguments).join(' ')); };
        try {
          return {result: await dTest.throws(fn), errors: errors};
        } finally {
          console.error = error;
        }
      };

      // a Google or Facebook account, made the way its login handler makes one
      var external = async function(service, serviceData, profileName) {
        var result = await Accounts.updateOrCreateUserFromExternalService(service, serviceData, {profile: {name: profileName}});
        return keep(result && result.userId);
      };

      var mailingListJob = function(jobs) {
        var list = dTest.jobsNamed(jobs, 'addToMailingList');
        equal(list.length, 1, 'one addToMailingList job');
        return list[0];
      };

      var ranking = function() {
        return {wins: 0, numVassalsRank: 0, incomeRank: 0, lostSoldiersRank: 0, villagesRank: 0, numGames: 0, overall: 0};
      };

      try {

        await test('signup with a password over DDP: the account is set up, logged in, verified on a development server and put on the mailing list', async function() {
          var username = name('ah_signup_');
          var email = username + '@example.com';
          var client = await connect();
          var login;
          var out = await signingUp(async function() {
            login = await client.call('createUser', {username: username, email: email, password: hashed(PASSWORD)});
          });
          keep(login && login.id);
          assert(login && login.id && login.token, 'the browser is logged in as the new account');

          var u = await user(login.id);
          equal(u.username, username, 'username');
          equal(u.emails[0].address, email, 'email');
          equal(JSON.stringify(u.profile), '{}', 'an empty profile');
          equal(JSON.stringify([u.admin, u.moderator, u.pro, u.proTokens, u.male, u.avatarFilename]),
            JSON.stringify([false, false, false, 0, true, null]), 'admin, moderator, pro, proTokens, male, avatarFilename');
          equal(JSON.stringify(u.results), '[]', 'no results');
          equal(JSON.stringify(u.purchases), JSON.stringify({castles: ['castle_02_keep']}), 'the free castle');
          equal(JSON.stringify(u.rankingRegular), JSON.stringify(ranking()), 'regular ranking');
          equal(JSON.stringify(u.rankingPro), JSON.stringify(ranking()), 'pro ranking');
          assert(u.createdAt instanceof Date && Math.abs(u.createdAt - new Date()) < 60000, 'created now');
          assert(u.services.password && u.services.password.bcrypt, 'the password is kept as bcrypt');
          equal(u.verifiedEmail, true, 'a development server verifies the email straight away');
          equal(u.emails[0].verified, true, 'and marks the address verified');
          equal(u.isNewUser, false, 'signing up logs in, and the login clears isNewUser');

          var job = mailingListJob(out.jobs);
          equal(JSON.stringify(job.data), JSON.stringify({name: username, email: email}), 'the job has the name and email');
          equal(JSON.stringify(job.options), JSON.stringify({attempts: 10, backoff: {type: 'fixed', delay: 15000}, delay: 0, timeout: 1000 * 60 * 5}), 'its options');
          equal(job.uniqueId, email, 'one job per address');

          equal(JSON.stringify(out.emails), JSON.stringify([[login.id, email]]), 'a verification email to the address');
        });

        await test('signup: a name already taken, by any case, or an email already used is refused, and nothing is queued', async function() {
          var username = name('ah_taken_');
          keep(await Accounts.createUser({username: username, email: username + '@example.com', password: PASSWORD}));
          var client = await connect();
          var tries = [
            [{username: username, email: name('ah_other_') + '@example.com'}, 'Username already exists.', 'the same name'],
            [{username: username.toUpperCase(), email: name('ah_other_') + '@example.com'}, 'Username already exists.', 'the name in capitals'],
            [{username: name('ah_other_'), email: username + '@example.com'}, 'Email already exists.', 'the same email']
          ];
          await dTest.eachAsync(tries, async function(attempt) {
            var error;
            var out = await signingUp(async function() {
              error = await dTest.throws(async function() {
                return await client.call('createUser', _.extend({password: hashed(PASSWORD)}, attempt[0]));
              });
            });
            equal(error && error.error, 403, attempt[2] + ': refused');
            equal(error && error.reason, attempt[1], attempt[2] + ': reason');
            equal(out.jobs.length + out.emails.length, 0, attempt[2] + ': no job or email');
          });
          equal(await Meteor.users.find({username: {$regex: '^' + username + '$', $options: 'i'}}).countAsync(), 1, 'still one account with that name');
        });

        await test('signup on the server: a name longer than 25 letters is cut to 25, and the account is new until it logs in', async function() {
          var username = name('ah_long_') + 'abcdefghijklmnopqrstuvwxyz';
          var out = await signingUp(function() {
            return Promise.resolve(Accounts.createUser({username: username, email: name('ah_long_') + '@example.com', password: PASSWORD})).then(keep);
          });
          var u = await user(_.last(userIds));
          equal(u.username, username.substring(0, 25), 'cut to 25');
          equal(u.isNewUser, true, 'new until the first login');
          equal(mailingListJob(out.jobs).data.name, username.substring(0, 25), 'the mailing list gets the cut name');
          equal(out.emails.length, 0, 'Accounts.createUser on the server sends no email');
        });

        await test('login with a password over DDP: the first login clears isNewUser, by username or by email', async function() {
          var username = name('ah_login_');
          var email = username + '@example.com';
          var userId = keep(await Accounts.createUser({username: username, email: email, password: PASSWORD}));
          equal((await user(userId)).isNewUser, true, 'new before logging in');

          var client = await connect();
          var login = await client.call('login', {user: {username: username}, password: hashed(PASSWORD)});
          equal(login && login.id, userId, 'logged in by username');
          equal((await user(userId)).isNewUser, false, 'cleared by the time the login returns');

          var again = await (await connect()).call('login', {user: {email: email}, password: hashed(PASSWORD)});
          equal(again && again.id, userId, 'logged in by email');
          equal((await user(userId)).isNewUser, false, 'still cleared');

          var wrong = await dTest.throws(async function() { return await (await connect()).call('login', {user: {username: username}, password: hashed('not it')}); });
          equal(wrong && wrong.reason, 'Incorrect password', 'a wrong password is refused');
        });

        await test('login: an old pro account\'s email makes the account and all its players pro, and merges its castles', async function() {
          var username = name('ah_oldpro_');
          var email = username + '@example.com';
          var userId = keep(await Accounts.createUser({username: username, email: email, password: PASSWORD}));
          oldProIds.push(await OldProUsers.insertAsync({email: email, purchases: {castles: ['castle_02_keep', 'ah_castle_a', 'ah_castle_b']}}));
          playerIds.push(await Players.insertAsync({gameId: 'ah_game_1', userId: userId, pro: false}));
          playerIds.push(await Players.insertAsync({gameId: 'ah_game_2', userId: userId, pro: false}));
          var otherUser = keep(await Accounts.createUser({username: name('ah_other_'), email: name('ah_other_') + '@example.com', password: PASSWORD}));
          playerIds.push(await Players.insertAsync({gameId: 'ah_game_1', userId: otherUser, pro: false}));

          await connect(userId);

          var u = await user(userId);
          equal(u.pro, true, 'the account is pro');
          equal(JSON.stringify(u.purchases.castles), JSON.stringify(['castle_02_keep', 'ah_castle_a', 'ah_castle_b']), 'the old castles are added');
          equal(await Players.find({userId: userId, pro: true}).countAsync(), 2, 'both of its players are pro');
          equal((await Players.findOneAsync({userId: otherUser})).pro, false, 'someone else\'s player is not');
          equal((await user(otherUser)).pro, false, 'nor is someone else\'s account');
          equal(u.isNewUser, false, 'and isNewUser is cleared');
        });

        await test('login: an old pro account with only the free castle is made pro, and its purchases are left alone', async function() {
          var username = name('ah_oldpro_');
          var email = username + '@example.com';
          var userId = keep(await Accounts.createUser({username: username, email: email, password: PASSWORD}));
          await Meteor.users.updateAsync(userId, {$set: {'purchases.castles': ['castle_02_keep', 'ah_bought_here']}});
          oldProIds.push(await OldProUsers.insertAsync({email: email, purchases: {castles: ['ah_castle_a']}}));

          await connect(userId);

          var u = await user(userId);
          equal(u.pro, true, 'pro');
          equal(JSON.stringify(u.purchases.castles), JSON.stringify(['castle_02_keep', 'ah_bought_here']), 'purchases unchanged');
        });

        await test('login: an account that was never pro stays as it is', async function() {
          var userId = keep(await Accounts.createUser({username: name('ah_plain_'), email: name('ah_plain_') + '@example.com', password: PASSWORD}));
          playerIds.push(await Players.insertAsync({gameId: 'ah_game_1', userId: userId, pro: false}));
          var before = _.omit(await user(userId), 'services', 'isNewUser', 'presence', 'status');

          await connect(userId);

          var after = await user(userId);
          equal(JSON.stringify(_.omit(after, 'services', 'isNewUser', 'presence', 'status')), JSON.stringify(before), 'nothing else changed');
          equal(after.isNewUser, false, 'isNewUser cleared');
          equal((await Players.findOneAsync({userId: userId})).pro, false, 'its player is not pro');
        });

        // AccountsEmail.extract gives no address for these: an account whose
        // emails list is gone, and one from a service it doesn't know (where
        // it gives back the account itself)
        await dTest.eachAsync([
          ['with no emails list', {$unset: {emails: 1}}],
          ['whose email has no address', {$set: {emails: [{verified: true}]}}],
          ['signed up through Twitter', {$unset: {emails: 1}, $set: {'services.twitter': {id: 'ah_twitter'}}}]
        ], async function(c) {
          await test('login: an account ' + c[0] + ' is not made pro by whatever is on the old pro list', async function() {
            oldProIds.push(await OldProUsers.insertAsync({email: name('ah_oldpro_') + '@example.com', purchases: {castles: ['castle_02_keep', 'ah_castle_a', 'ah_castle_b']}}));
            oldProIds.push(await OldProUsers.insertAsync({purchases: {castles: ['castle_02_keep', 'ah_castle_c']}}));
            var userId = keep(await Accounts.createUser({username: name('ah_noemail_'), email: name('ah_noemail_') + '@example.com', password: PASSWORD}));
            await Meteor.users.updateAsync(userId, c[1]);
            playerIds.push(await Players.insertAsync({gameId: 'ah_game_1', userId: userId, pro: false}));
            equal(typeof AccountsEmail.extract(await user(userId)), c[0] == 'signed up through Twitter' ? 'object' : 'undefined', 'no address to look up');
            var before = (await user(userId)).purchases;

            await connect(userId);

            var u = await user(userId);
            equal(u.pro, false, 'the account is not pro');
            equal(JSON.stringify(u.purchases), JSON.stringify(before), 'and gets no castles');
            equal((await Players.findOneAsync({userId: userId})).pro, false, 'nor is its player');
            equal(u.isNewUser, false, 'isNewUser is still cleared');
          });
        });

        await test('Google signup: the profile name is the username, the address is its Google email, and only the admin\'s email is made admin', async function() {
          var adminEmail = name('ah_admin_') + '@example.com';
          var hadAdminEmail = _.has(process.env, 'DOMINUS_ADMIN_EMAIL');
          var wasAdminEmail = process.env.DOMINUS_ADMIN_EMAIL;
          process.env.DOMINUS_ADMIN_EMAIL = adminEmail;
          try {
            var plainName = 'AH Google ' + Random.id(5);
            var plainEmail = name('ah_google_') + '@example.com';
            var plain, admin;
            var out = await signingUp(async function() {
              plain = await external('google', {id: name('ah_g_'), email: plainEmail, verified_email: false, name: plainName}, plainName);
              admin = await external('google', {id: name('ah_g_'), email: adminEmail, verified_email: true, name: 'AH Admin'}, 'AH Admin ' + Random.id(5));
            });

            var u = await user(plain);
            equal(u.username, plainName, 'the username is the Google name');
            equal(u.admin, false, 'not admin');
            equal(u.verifiedEmail, true, 'verified on a development server, whatever Google says');
            equal(u.emails, undefined, 'no emails list: the address stays under services.google');
            equal(JSON.stringify(u.profile), JSON.stringify({name: plainName}), 'the profile');
            equal(u.isNewUser, true, 'new until it logs in');
            equal((await user(admin)).admin, true, 'the admin\'s Google email is made admin');

            var jobs = dTest.jobsNamed(out.jobs, 'addToMailingList');
            equal(JSON.stringify(_.pluck(jobs, 'data')), JSON.stringify([{name: plainName, email: plainEmail}, {name: (await user(admin)).username, email: adminEmail}]), 'each is put on the mailing list');
            equal(out.emails.length, 0, 'no verification email');
          } finally {
            if (hadAdminEmail) process.env.DOMINUS_ADMIN_EMAIL = wasAdminEmail;
            else delete process.env.DOMINUS_ADMIN_EMAIL;
          }
        });

        await test('Google signup: a name already taken, by any case, gets up to two digits added', async function() {
          var taken = 'AH Taken ' + Random.id(5);
          var first = await external('google', {id: name('ah_g_'), email: name('ah_google_') + '@example.com'}, taken);
          var second = await external('google', {id: name('ah_g_'), email: name('ah_google_') + '@example.com'}, taken.toLowerCase());
          equal((await user(first)).username, taken, 'the first keeps it');
          var secondName = (await user(second)).username;
          assert(new RegExp('^' + taken.toLowerCase() + '\\d{1,2}$').test(secondName), 'the second gets digits: ' + secondName);
        });

        await test('Google signup: a name over 25 letters is cut before the duplicate check', async function() {
          var long = 'AH Long Google Name ' + Random.id(10);
          var first = await external('google', {id: name('ah_g_'), email: name('ah_google_') + '@example.com'}, long);
          equal((await user(first)).username, long.substring(0, 25), 'cut to 25');
          var second = await external('google', {id: name('ah_g_'), email: name('ah_google_') + '@example.com'}, long + 'x');
          var secondName = (await user(second)).username;
          assert(new RegExp('^' + long.substring(0, 25) + '\\d{1,2}$').test(secondName), 'the cut name was taken, so digits are added: ' + secondName);
        });

        await test('Google: logging in again with the same Google account updates it instead of making another', async function() {
          var googleId = name('ah_g_');
          var email = name('ah_google_') + '@example.com';
          var first = await external('google', {id: googleId, email: email}, 'AH Again ' + Random.id(5));
          var out = await signingUp(function() {
            return Promise.resolve(Accounts.updateOrCreateUserFromExternalService('google', {id: googleId, email: email, picture: 'new'}, {profile: {name: 'Another Name'}})).then(function(result) {
              equal(result.userId, first, 'the same account');
            });
          });
          equal(out.jobs.length, 0, 'onCreateUser did not run again');
          equal((await user(first)).services.google.picture, 'new', 'the service data is updated');
          equal(await Meteor.users.find({'services.google.id': googleId}).countAsync(), 1, 'one account');
        });

        await test('Facebook signup: the profile name is the username, verified, with its Facebook email on the mailing list', async function() {
          var fbName = 'AH Facebook ' + Random.id(5);
          var email = name('ah_fb_') + '@example.com';
          var userId;
          var out = await signingUp(async function() {
            userId = await external('facebook', {id: name('ah_f_'), email: email}, fbName);
          });
          var u = await user(userId);
          equal(u.username, fbName, 'the username is the Facebook name');
          equal(u.verifiedEmail, true, 'verified');
          equal(u.admin, false, 'not admin');
          equal(JSON.stringify(mailingListJob(out.jobs).data), JSON.stringify({name: fbName, email: email}), 'the mailing list job');
        });

        await test('Facebook signup without an email is refused by validateNewUser, after onCreateUser logs it, and nothing is queued', async function() {
          var fbId = name('ah_f_');
          var refused;
          var out = await signingUp(async function() {
            refused = await quietErrors(function() {
              return external('facebook', {id: fbId}, 'AH No Email ' + Random.id(5));
            });
          });
          equal(refused.result && refused.result.error, 403, 'refused');
          equal(refused.result && refused.result.reason, 'Email is null, must be valid.', 'with the reason');
          equal(JSON.stringify(refused.errors), JSON.stringify(['User does not have an email in onCreateUser']), 'onCreateUser logged it');
          equal(out.jobs.length, 0, 'no mailing list job');
          equal(await Meteor.users.find({'services.facebook.id': fbId}).countAsync(), 0, 'no account made');
        });

        await run('accounts: the worker\'s start leaves one Google and one Facebook login configuration, from the settings', async function() {
          if (process.env.DOMINUS_WORKER != 'true') return 'skip';
          var configs = Accounts.loginServiceConfiguration;
          equal(await configs.find({service: 'google'}).countAsync(), 1, 'one Google');
          equal(await configs.find({service: 'facebook'}).countAsync(), 1, 'one Facebook');
          // only compare which keys there are: the values are secrets
          equal(_.keys(_.omit(await configs.findOneAsync({service: 'google'}), '_id')).sort().join(','), _.keys(Meteor.settings.googleLogin).sort().join(','), 'Google\'s fields');
          equal((await configs.findOneAsync({service: 'google'})).clientId === Meteor.settings.googleLogin.clientId, true, 'Google\'s client id is the one in the settings');
          equal((await configs.findOneAsync({service: 'facebook'})).appId === Meteor.settings.facebookLogin.appId, true, 'Facebook\'s app id is the one in the settings');
        });

      } finally {
        clients.forEach(function(client) { client.close(); });
        await Players.removeAsync({_id: {$in: playerIds}});
        // and any an earlier run that was stopped half way left behind
        await OldProUsers.removeAsync({$or: [{_id: {$in: oldProIds}}, {email: /^ah_oldpro_/}, {'purchases.castles': 'ah_castle_c'}]});
        await Meteor.users.removeAsync({_id: {$in: userIds}});
      }
    });
  });
}
