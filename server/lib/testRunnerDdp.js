// Test helpers for calling methods the way a browser does: over a real DDP
// connection to this server, logged in as a test user (Oct 2026).
// Loaded after server/lib/testRunner.js (same folder, sorts after it).
//
// A call goes through everything a client call goes through: DDP, the rate
// limiter, server/methodGate.js and the method itself. Calls return a
// promise underneath and are waited on with dTest.settle, so they keep
// working when the client side moves to Meteor.callAsync.

if (Meteor.isServer) {

  // polls fn until it returns something truthy or ms pass
  dTest.waitFor = function(fn, ms) {
    var end = Date.now() + (ms || 10000);
    while (Date.now() < end) {
      if (fn()) return true;
      dTest.sleep(50);
    }
    return !!fn();
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
  dTest.ddp.connect = function(userId) {
    var connection = DDP.connect(Meteor.absoluteUrl());
    if (!dTest.waitFor(function() { return connection.status().connected; }, 10000)) {
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
      call: function(name /* , args */) {
        return dTest.settle(client.applyAsync(name, _.toArray(arguments).slice(1)));
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
    client.docs = function(name) {
      return client.collection(name).find({}, {sort: {_id: 1}}).fetch();
    };

    // Subscribes and waits until the subscription is ready or stopped.
    // Returns {ready, error, stop()}; error is what the publication threw.
    client.subscribe = function(name /* , args */) {
      var args = _.toArray(arguments).slice(1);
      var state = {ready: false, error: null, stopped: false};
      var handle = connection.subscribe.apply(connection, [name].concat(args).concat([{
        onReady: function() { state.ready = true; },
        onStop: function(error) { state.stopped = true; state.error = error || null; }
      }]));
      if (!dTest.waitFor(function() { return state.ready || state.stopped; }, 10000)) {
        handle.stop();
        throw new Error('FAIL: subscription ' + name + ' was neither ready nor stopped after 10 seconds');
      }
      state.stop = function() { handle.stop(); };
      return state;
    };

    if (userId) {
      var stamped = Accounts._generateStampedLoginToken();
      Accounts._insertLoginToken(userId, stamped);
      var login = client.call('login', {resume: stamped.token});
      if (!login || login.id !== userId) {
        client.close();
        throw new Error('FAIL: DDP login as ' + userId + ' failed');
      }
      client.userId = userId;
    }

    return client;
  };

  // runs fn(client) with a client logged in as userId, and closes it after
  dTest.ddp.as = function(userId, fn) {
    var client = dTest.ddp.connect(userId);
    try {
      return dTest.settle(fn(client));
    } finally {
      client.close();
    }
  };
}
