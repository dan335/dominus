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
    dTest.addSuite('browser error reports (server/clientErrorTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var expectError = dTest.expectError;
      var test = dTest.contractTest(run);

      var clients = [];
      var userIds = [];
      var connect = function(userId) {
        var client = dTest.ddp.connect(userId);
        clients.push(client);
        return client;
      };

      // the lines console.log printed while fn ran, and what ClientErrors kept
      function logged(fn) {
        var lines = [];
        var log = console.log;
        var recent = ClientErrors.recent.length;
        console.log = function() {
          var line = _.toArray(arguments).join(' ');
          if (line.indexOf('Client error: ') === 0) lines.push(line);
          else log.apply(console, arguments);
        };
        try {
          fn();
        } finally {
          console.log = log;
        }
        return {lines: lines, entries: ClientErrors.recent.slice(recent)};
      }

      var report = function(fields) {
        return _.extend({kind: 'error', message: 'Test error'}, fields || {});
      };

      try {

        test('a logged out report is logged as one line of JSON, with no user', function() {
          var client = connect();
          var out = logged(function() {
            client.call('reportClientError', report({message: 'Two\nlines', stack: 'at a\nat b', path: '/games',
              version: 'abc', userAgent: 'Test browser'}));
          });
          equal(out.lines.length, 1, 'one line logged');
          equal(out.lines[0].indexOf('\n'), -1, 'the newlines in it are escaped');
          var entry = JSON.parse(out.lines[0].slice('Client error: '.length));
          equal(JSON.stringify(entry), JSON.stringify({kind: 'error', message: 'Two\nlines', stack: 'at a\nat b',
            path: '/games', version: 'abc', userAgent: 'Test browser', userId: null}), 'what was logged');
          equal(JSON.stringify(out.entries), JSON.stringify([entry]), 'and kept in ClientErrors.recent');
        });

        test('a signed in report names the user, and a long one is cut short', function() {
          var user = dTest.helpers.createTestUser({username: 'clienterr_' + Random.id(6)});
          userIds.push(user._id);
          var client = connect(user._id);
          var long = new Array(5001).join('x');
          var out = logged(function() {
            client.call('reportClientError', report({kind: long, message: long, stack: long, path: long, version: long, userAgent: long}));
          });
          var entry = out.entries[0];
          equal(entry.userId, user._id, 'the user');
          equal([entry.kind.length, entry.message.length, entry.stack.length, entry.path.length, entry.version.length,
            entry.userAgent.length].join(','), '40,2000,2000,200,100,300', 'each field cut to its length');
        });

        test('one connection may send 5 reports a minute, and another connection is counted on its own', function() {
          var busy = connect();
          var other = connect();
          var out = logged(function() {
            _.times(5, function(i) { busy.call('reportClientError', report({message: 'Busy ' + i})); });
            expectError(function() { return busy.call('reportClientError', report({message: 'Busy 5'})); },
              'too-many-requests', null, 'the sixth report');
            other.call('reportClientError', report({message: 'Other'}));
          });
          equal(_.pluck(out.entries, 'message').join(','), 'Busy 0,Busy 1,Busy 2,Busy 3,Busy 4,Other', 'what was logged');
        });

        test('a report that is not the shape the page sends is refused, and nothing is logged', function() {
          var client = connect();
          var out = logged(function() {
            [
              [],
              [{message: 'no kind'}],
              [report({extra: 'field'})],
              [report({stack: {$ne: null}})],
              [report({message: 5})],
              ['just a string']
            ].forEach(function(args) {
              dTest.ddp.resetRateLimits();
              expectError(function() { return client.call.apply(client, ['reportClientError'].concat(args)); },
                400, null, 'reportClientError(' + JSON.stringify(args) + ')');
            });
          });
          equal(out.lines.length, 0, 'nothing logged');
        });

        test('ClientErrors.recent keeps only the last 20 reports', function() {
          var client = connect();
          logged(function() {
            _.times(4, function(round) {
              dTest.ddp.resetRateLimits();
              _.times(5, function(i) { client.call('reportClientError', report({message: 'Kept ' + (round * 5 + i)})); });
            });
            dTest.ddp.resetRateLimits();
            client.call('reportClientError', report({message: 'Kept 20'}));
          });
          equal(ClientErrors.recent.length, 20, 'twenty kept');
          equal(_.last(ClientErrors.recent).message, 'Kept 20', 'newest last');
          equal(ClientErrors.recent[0].message, 'Kept 1', 'the oldest dropped');
        });

      } finally {
        clients.forEach(function(client) { client.close(); });
        userIds.forEach(function(id) { Meteor.users.remove(id); });
        dTest.ddp.resetRateLimits();
      }
    });
  });
}
