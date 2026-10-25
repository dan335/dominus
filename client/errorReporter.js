// Sends this page's errors to the server log (server/clientErrors.js), so a
// broken helper or autorun shows up there and not only in the player's
// console. It only watches: errors still reach the console and the browser
// as before. Each different error is sent once per page load, at most
// MAX_REPORTS in all, and errors from other sites' scripts and from browser
// extensions are left out.

(function() {
  var MAX_REPORTS = 20;
  var MAX_LENGTH = 2000;
  var sent = {};
  var numSent = 0;
  var sending = false;

  var text = function(value) {
    return String(value === undefined || value === null ? '' : value).slice(0, MAX_LENGTH);
  };

  // the version of the code this page runs, to tell errors from pages that
  // haven't reloaded since a deploy
  var version = function() {
    var versions = ((__meteor_runtime_config__.autoupdate || {}).versions) || {};
    var v = versions['web.browser'] || versions['web.browser.legacy'];
    return v && v.version || '';
  };

  var fromThisSite = function(url) {
    return typeof url === 'string' && url.indexOf(location.origin + '/') === 0;
  };

  var report = function(kind, message, stack) {
    message = text(message);
    if (!message || sending || numSent >= MAX_REPORTS) return;
    var key = kind + ' ' + message;
    if (sent[key]) return;
    sent[key] = true;
    numSent++;

    sending = true;
    try {
      // with a callback, a refusal (the rate limit) goes to it and isn't logged
      Meteor.call('reportClientError', {
        kind: kind,
        message: message,
        stack: text(stack),
        // the path only: a query or hash can hold a token
        path: text(location.pathname),
        version: text(version()),
        userAgent: text(navigator.userAgent)
      }, function() {});
    } catch (error) {
      // never let reporting an error make another one
    } finally {
      sending = false;
    }
  };

  window.addEventListener('error', function(event) {
    // "Script error." with no file is another site's script
    if (!fromThisSite(event.filename)) return;
    report('error', event.message, event.error && event.error.stack);
  });

  window.addEventListener('unhandledrejection', function(event) {
    var reason = event.reason;
    var stack = reason && reason.stack;
    // a rejection with no stack from this site's code isn't ours
    if (typeof stack !== 'string' || stack.indexOf(location.origin + '/') === -1) return;
    report('unhandledrejection', reason.message || String(reason), stack);
  });

  // Meteor catches the exceptions from autoruns, template helpers and method
  // callbacks itself and logs them with Meteor._debug ("Exception from Tracker
  // recompute function:", "Exception in template helper:", ...), so they never
  // reach the listeners above. Meteor._debug is internal to Meteor, so check
  // this still works after a Meteor upgrade (tests/e2e/specs/clientErrors.spec.js).
  var debug = Meteor._debug;
  Meteor._debug = function(first, second) {
    var suppressed = Meteor._suppressed_log_expected && Meteor._suppressed_log_expected();
    var result = debug.apply(this, arguments);
    try {
      if (!suppressed && typeof first === 'string' && first.indexOf('Exception') === 0) {
        var detail = second && second.message || (typeof second === 'string' ? second.split('\n')[0] : '');
        var stack = second && second.stack || (typeof second === 'string' ? second : '');
        report('meteor', first + (detail ? ' ' + detail : ''), stack);
      }
    } catch (error) {
      // as above
    }
    return result;
  };
})();
