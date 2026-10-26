// Meteor 3's server cursors have no sync API, but only count() says so:
// fetch(), forEach() and map() quietly return a promise, so
// `Games.find().fetch().length` is undefined instead of an error.
// tests/async/check-await.js flags the calls it can see in server files; this
// catches the rest when they happen (a shared helper the server calls, say).
// Each place is logged once, and the tests fail on any (dTest.watchProcess).
// The call still returns its promise, so one that is awaited works as before.
// Calls from Meteor's own and Atmosphere packages are left alone: the mongo
// package's findOneAsync awaits a fetch(), and accounts-base awaits forEach.
dSyncCursor = {listeners: []};

(function() {
  var proto = Object.getPrototypeOf(Meteor.users.find({_id: null}));
  var logged = {};
  // the app's files and its own packages (packages/dominus-*, forum-*, bootstrap)
  var isOurs = function(frame) {
    var inPackage = /\bpackages\/([^\/]+)\//.exec(frame || '');
    if (inPackage) return /^(dominus-|forum-|bootstrap$)/.test(inPackage[1]);
    return !/node_modules|node:internal/.test(frame || '');
  };
  ['fetch', 'forEach', 'map'].forEach(function(method) {
    var original = proto[method];
    // fetchAsync and the others call fetch(); they go to the original instead
    proto[method + 'Async'] = function() {
      return original.apply(this, arguments);
    };
    proto[method] = function() {
      var where = (new Error().stack || '').split('\n').slice(2, 7).join('\n');
      var caller = where.split('\n')[0];
      if (!isOurs(caller)) {
        return original.apply(this, arguments);
      }
      if (!logged[caller]) {
        logged[caller] = true;
        console.error('Sync cursor ' + method + '() on the server, which returns a promise on Meteor 3 (use ' + method + 'Async):\n' + where);
      }
      dSyncCursor.listeners.forEach(function(listener) { listener(method, where); });
      return original.apply(this, arguments);
    };
  });
})();
