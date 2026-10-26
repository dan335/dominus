// The browser error reporter (Oct 2026): reportClientError
// (server/clientErrors.js), called over a real DDP connection the way
// client/errorReporter.js calls it. Anyone can call it, so these check that it
// only logs, one line per report, with each field cut short, and that its
// rate limit holds. tests/e2e/specs/clientErrors.spec.js checks the browser side.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    dTest.addSuite('browser error reports (server/clientErrorTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var expectError = dTest.expectError;
      var test = dTest.contractTest(run);

      var clients = [];
      var userIds = [];
      var connect = async function(userId) {
        var client = await dTest.ddp.connect(userId);
        clients.push(client);
        return client;
      };

      // the lines console.log printed while fn ran, and what ClientErrors kept
      async function logged(fn) {
        var lines = [];
        var log = console.log;
        // emptied while fn runs: once it holds ClientErrors.keep reports (as on
        // a second run of the suites), its length no longer grows
        var before = ClientErrors.recent.splice(0);
        var entries;
        console.log = function() {
          var line = _.toArray(arguments).join(' ');
          if (line.indexOf('Client error: ') === 0) lines.push(line);
          else log.apply(console, arguments);
        };
        try {
          await fn();
        } finally {
          console.log = log;
          entries = ClientErrors.recent.splice(0);
          ClientErrors.recent.push.apply(ClientErrors.recent, before.concat(entries).slice(-ClientErrors.keep));
        }
        return {lines: lines, entries: entries};
      }

      var report = function(fields) {
        return _.extend({kind: 'error', message: 'Test error'}, fields || {});
      };

      try {

        await test('a logged out report is logged as one line of JSON, with no user', async function() {
          var client = await connect();
          var out = await logged(async function() {
            await client.call('reportClientError', report({message: 'Two\nlines', stack: 'at a\nat b', path: '/games',
              version: 'abc', userAgent: 'Test browser'}));
          });
          equal(out.lines.length, 1, 'one line logged');
          equal(out.lines[0].indexOf('\n'), -1, 'the newlines in it are escaped');
          var entry = JSON.parse(out.lines[0].slice('Client error: '.length));
          equal(JSON.stringify(entry), JSON.stringify({kind: 'error', message: 'Two\nlines', stack: 'at a\nat b',
            path: '/games', version: 'abc', userAgent: 'Test browser', userId: null}), 'what was logged');
          equal(JSON.stringify(out.entries), JSON.stringify([entry]), 'and kept in ClientErrors.recent');
        });

        await test('a signed in report names the user, and a long one is cut short', async function() {
          var user = await dTest.helpers.createTestUser({username: 'clienterr_' + Random.id(6)});
          userIds.push(user._id);
          var client = await connect(user._id);
          var long = new Array(5001).join('x');
          var out = await logged(async function() {
            await client.call('reportClientError', report({kind: long, message: long, stack: long, path: long, version: long, userAgent: long}));
          });
          var entry = out.entries[0];
          equal(entry.userId, user._id, 'the user');
          equal([entry.kind.length, entry.message.length, entry.stack.length, entry.path.length, entry.version.length,
            entry.userAgent.length].join(','), '40,2000,2000,200,100,300', 'each field cut to its length');
        });

        await test('one connection may send 5 reports a minute, and another connection is counted on its own', async function() {
          var busy = await connect();
          var other = await connect();
          var out = await logged(async function() {
            for (let i = 0; i < 5; i++) await busy.call('reportClientError', report({message: 'Busy ' + i}));
            await expectError(async function() { return await busy.call('reportClientError', report({message: 'Busy 5'})); },
              'too-many-requests', null, 'the sixth report');
            await other.call('reportClientError', report({message: 'Other'}));
          });
          equal(_.pluck(out.entries, 'message').join(','), 'Busy 0,Busy 1,Busy 2,Busy 3,Busy 4,Other', 'what was logged');
        });

        await test('a report that is not the shape the page sends is refused, and nothing is logged', async function() {
          var client = await connect();
          var out = await logged(async function() {
            await dTest.eachAsync([
              [],
              [{message: 'no kind'}],
              [report({extra: 'field'})],
              [report({stack: {$ne: null}})],
              [report({message: 5})],
              ['just a string']
            ], async function(args) {
              dTest.ddp.resetRateLimits();
              await expectError(function() { return client.call.apply(client, ['reportClientError'].concat(args)); },
                400, null, 'reportClientError(' + JSON.stringify(args) + ')');
            });
          });
          equal(out.lines.length, 0, 'nothing logged');
        });

        await test('ClientErrors.recent keeps only the last 20 reports', async function() {
          var client = await connect();
          await logged(async function() {
            for (let round = 0; round < 4; round++) {
              dTest.ddp.resetRateLimits();
              for (let i = 0; i < 5; i++) await client.call('reportClientError', report({message: 'Kept ' + (round * 5 + i)}));
            }
            dTest.ddp.resetRateLimits();
            await client.call('reportClientError', report({message: 'Kept 20'}));
          });
          equal(ClientErrors.recent.length, 20, 'twenty kept');
          equal(_.last(ClientErrors.recent).message, 'Kept 20', 'newest last');
          equal(ClientErrors.recent[0].message, 'Kept 1', 'the oldest dropped');
        });

      } finally {
        clients.forEach(function(client) { client.close(); });
        await dTest.eachAsync(userIds, async function(id) { await Meteor.users.removeAsync(id); });
        dTest.ddp.resetRateLimits();
      }
    });
  });
}
