// dTest.onClient(fn): runs fn the way the browser runs it, against minimongo.
//
// A method's client simulation and the shared helpers the browser calls
// (dMarket.total_of_buy and the like) use the sync collection API: findOne,
// insert, update, a cursor's fetch and count. Meteor 3's server doesn't have
// it (findOne throws; fetch quietly returns a promise), so the tests that
// check a simulation or a sync helper against the server run them here.
//
// For as long as fn runs, every server collection reads and writes a
// minimongo copy of the documents the database has when it starts, as the
// browser's collections hold what it subscribed to. That covers the async
// API as well, so the test can set up and read back what fn did the same way.
// Nothing fn writes reaches the database.
//
// fn mustn't wait on anything that runs server code against the database
// meanwhile (a DDP call, a job): it would see the copies. The suites run one
// test at a time with the crons paused, so nothing else does.
// Loaded after server/lib/testRunner.js (same folder, sorts after it).

if (Meteor.isServer) {

  // every collection of this server: the globals and the packages' exports,
  // but not the collections of a DDP connection to somewhere (the tests' own)
  dTest.serverCollections = function() {
    var found = [];
    var add = function(value) {
      if (value instanceof Mongo.Collection && value._name && !value._isRemoteCollection() && !_.contains(found, value)) {
        found.push(value);
      }
    };
    _.each(_.keys(global), function(key) {
      var value;
      try { value = global[key]; } catch (e) { return; }
      add(value);
    });
    _.each(Package, function(exports) {
      _.each(exports, add);
    });
    add(Meteor.users);
    return found;
  };

  var running = false;

  dTest.onClient = async function(fn) {
    if (running) throw new Error('dTest.onClient: already running');
    running = true;
    var swapped = [];
    try {
      for (var collection of dTest.serverCollections()) {
        var docs = await collection.find({}).fetchAsync();
        var copy = new Package.minimongo.LocalCollection(collection._name);
        docs.forEach(function(doc) { copy.insert(doc); });
        swapped.push({collection: collection, original: collection._collection});
        collection._collection = copy;
      }
      return await fn();
    } finally {
      swapped.forEach(function(s) { s.collection._collection = s.original; });
      running = false;
    }
  };

  // what a sync call gives: {value} or {error}, to compare outside onClient
  dTest.outcome = function(fn) {
    try {
      return {value: fn()};
    } catch (error) {
      return {error: error};
    }
  };
}
