// Test helpers for calling methods the way a browser does: over a real DDP
// connection to this server, logged in as a test user (Oct 2026).
// Loaded after server/lib/testRunner.js (same folder, sorts after it).
//
// A call goes through everything a client call goes through: DDP, the rate
// limiter, server/methodGate.js and the method itself. Calls, subscribes and
// docs return promises.

if (Meteor.isServer) {

  // polls fn until it returns (or resolves with) something truthy or ms pass
  dTest.waitFor = async function(fn, ms) {
    var end = Date.now() + (ms || 10000);
    while (Date.now() < end) {
      if (await fn()) return true;
      await dTest.sleep(50);
    }
    return !!(await fn());
  };

  dTest.ddp = {};

  // Clears every rate limit counter, so a test starts with a full allowance.
  // Tests that check a limit itself call this first too.
  dTest.ddp.resetRateLimits = function() {
    _.each(DDPRateLimiter.printRules(), function(rule) {
      rule.resetCounter();
    });
  };

  // A DDP client connected to this server, logged in as userId (or logged
  // out without one). Close it when done.
  dTest.ddp.connect = async function(userId) {
    var connection = DDP.connect(Meteor.absoluteUrl());
    if (!await dTest.waitFor(function() { return connection.status().connected; }, 10000)) {
      connection.disconnect();
      throw new Error('FAIL: could not open a DDP connection to ' + Meteor.absoluteUrl());
    }

    var client = {
      connection: connection,
      userId: null,

      // promise of the method's result
      applyAsync: function(name, args) {
        return new Promise(function(resolve, reject) {
          connection.apply(name, args || [], {noRetry: true}, function(error, result) {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          });
        });
      },

      // the method's result; throws what the method threw, as the client sees it
      call: async function(name /* , args */) {
        return await client.applyAsync(name, _.toArray(arguments).slice(1));
      },

      close: function() {
        connection.disconnect();
      }
    };

    // Documents this client received, by collection name. A collection is set
    // up the first time it is asked for; ask before subscribing so nothing is
    // missed.
    var collections = {};
    client.collection = function(name) {
      if (!collections[name]) {
        collections[name] = new Mongo.Collection(name, {connection: connection});
      }
      return collections[name];
    };

    // docs of a collection, sorted by _id
    client.docs = async function(name) {
      return await client.collection(name).find({}, {sort: {_id: 1}}).fetchAsync();
    };

    // Subscribes and waits until the subscription is ready or stopped.
    // Returns {ready, error, stop()}; error is what the publication threw.
    client.subscribe = async function(name /* , args */) {
      var args = _.toArray(arguments).slice(1);
      var state = {ready: false, error: null, stopped: false};
      var handle = connection.subscribe.apply(connection, [name].concat(args).concat([{
        onReady: function() { state.ready = true; },
        onStop: function(error) { state.stopped = true; state.error = error || null; }
      }]));
      if (!await dTest.waitFor(function() { return state.ready || state.stopped; }, 10000)) {
        handle.stop();
        throw new Error('FAIL: subscription ' + name + ' was neither ready nor stopped after 10 seconds');
      }
      state.stop = function() { handle.stop(); };
      return state;
    };

    if (userId) {
      var stamped = Accounts._generateStampedLoginToken();
      Accounts._insertLoginToken(userId, stamped);
      var login = await client.call('login', {resume: stamped.token});
      if (!login || login.id !== userId) {
        client.close();
        throw new Error('FAIL: DDP login as ' + userId + ' failed');
      }
      client.userId = userId;
    }

    return client;
  };

  // Subscribes to a publication over a fresh client and checks that each
  // part's local collection holds exactly the documents the database has for
  // it, with exactly the expected fields. Throws a FAIL error otherwise.
  //
  //   pub     the publication's name; null checks what the null (universal)
  //           publications send on their own
  //   args    its arguments
  //   as      userId to log in as, or null for a logged out client
  //   who     how to name the caller in messages (defaults to `as`)
  //   error   the error code the subscription should fail with instead
  //   coll, source, query, ids, keys, nested, skip: one part, or a list of
  //   them in `parts`:
  //     coll    the collection name on the client
  //     source  the server collection the documents come from
  //     query   selector for the documents expected in source; null for none
  //     ids     or the expected _ids, when a selector can't say it (limits)
  //     keys    the fields expected, or 'all' for the whole document
  //     nested  {field: [paths]} for a dotted projection like income.worth
  //     skip    _ids left out on both sides, such as the caller's own user,
  //             which the null publication also sends
  dTest.checkPublication = async function(spec) {
    var assert = function(ok, message) { if (!ok) throw new Error('FAIL: ' + message); };
    var equal = function(got, expected, message) {
      if (got !== expected) throw new Error('FAIL: ' + message + ' (expected ' + expected + ', got ' + got + ')');
    };
    var who = spec.who === undefined ? spec.as : spec.who;
    var client = await dTest.ddp.connect(spec.as || null);
    try {
      var parts = spec.parts || [_.pick(spec, 'coll', 'source', 'query', 'ids', 'keys', 'nested', 'skip')];
      parts.forEach(function(p) { client.collection(p.coll); });
      var sub = null;
      if (spec.pub) {
        sub = await client.subscribe.apply(null, [spec.pub].concat(spec.args || []));
        if (spec.error) {
          assert(sub.error, spec.pub + ': expected the subscription to fail');
          equal(sub.error.error, spec.error, spec.pub + ': error');
          return;
        }
        assert(sub.ready, spec.pub + ': ready (error: ' + (sub.error && sub.error.reason) + ')');
      }
      await dTest.eachAsync(parts, async function(p) {
        var label = (spec.pub || 'null publications') + ' -> ' + p.coll;
        var skip = p.skip || [];
        var fetchWant = async function() {
          if (p.query === null) return [];
          var selector = p.ids ? {_id: {$in: p.ids}} : p.query;
          return _.reject(await p.source.find(selector, {sort: {_id: 1}}).fetchAsync(), function(d) { return _.contains(skip, d._id); });
        };
        var fetchGot = async function() {
          return _.reject(await client.docs(p.coll), function(d) { return _.contains(skip, d._id); });
        };
        // documents can still be changing (presence, the null publications
        // after login), so give the two sides a moment to agree
        var got, want;
        await dTest.waitFor(async function() {
          got = await fetchGot();
          want = await fetchWant();
          return _.pluck(got, '_id').join(',') == _.pluck(want, '_id').join(',');
        }, spec.pub ? 2000 : 3000);
        equal(_.pluck(got, '_id').join(','), _.pluck(want, '_id').join(','), label + ': documents (' + who + ')');
        got.forEach(function(doc, n) {
          var db = want[n];
          if (p.keys == 'all') {
            assert(EJSON.equals(doc, db), label + ': whole document ' + doc._id);
            return;
          }
          var allowed = ['_id'].concat(p.keys);
          var extra = _.difference(_.keys(doc), allowed);
          assert(!extra.length, label + ': unexpected fields ' + extra.join(','));
          p.keys.forEach(function(k) {
            var expected = db[k];
            if (p.nested && p.nested[k] && expected) expected = dTest.pickPaths(expected, p.nested[k]);
            if (expected === undefined) {
              assert(!_.has(doc, k), label + ': ' + k + ' should not be sent when not set');
            } else {
              assert(EJSON.equals(doc[k], expected), label + ': ' + k + ' (' + JSON.stringify(doc[k]) + ' vs ' + JSON.stringify(expected) + ')');
            }
          });
        });
      });
      if (sub) sub.stop();
    } finally {
      client.close();
    }
  };

  // obj with only the dotted paths given ('winner.username'), like a projection
  dTest.pickPaths = function(obj, paths) {
    var out = {};
    paths.forEach(function(path) {
      var keys = path.split('.');
      var src = obj, dst = out;
      for (var i = 0; i < keys.length; i++) {
        if (src === null || typeof src !== 'object' || !_.has(src, keys[i])) return;
        if (i == keys.length - 1) {
          dst[keys[i]] = src[keys[i]];
        } else {
          dst[keys[i]] = dst[keys[i]] || {};
          dst = dst[keys[i]];
          src = src[keys[i]];
        }
      }
    });
    return out;
  };

  // runs fn(client) with a client logged in as userId, and closes it after
  dTest.ddp.as = async function(userId, fn) {
    var client = await dTest.ddp.connect(userId);
    try {
      return await fn(client);
    } finally {
      client.close();
    }
  };
}
