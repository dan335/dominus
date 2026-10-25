// Errors from players' browsers (client/errorReporter.js), logged so they show
// up in the server log next to the server's own errors. Anyone can call it,
// spectators too, so it only logs: each report is cut short, logged as one
// line of JSON (so it can't fake other log lines), and has its own rate limit.

ClientErrors = {
  maxLength: 2000,
  perMinute: 5,

  // the last few reports, newest last, for a look from meteor shell (and the tests)
  recent: [],
  keep: 20,

  clean: function(value, max) {
    return String(value === undefined || value === null ? '' : value).slice(0, max || ClientErrors.maxLength);
  },

  log: function(entry) {
    ClientErrors.recent.push(entry);
    if (ClientErrors.recent.length > ClientErrors.keep) {
      ClientErrors.recent.shift();
    }
    console.log('Client error: ' + JSON.stringify(entry));
  }
};

Meteor.methods({
  reportClientError: function(report) {
    check(report, {
      kind: String,
      message: String,
      stack: Match.Optional(String),
      path: Match.Optional(String),
      version: Match.Optional(String),
      userAgent: Match.Optional(String)
    });
    this.unblock();

    ClientErrors.log({
      kind: ClientErrors.clean(report.kind, 40),
      message: ClientErrors.clean(report.message),
      stack: ClientErrors.clean(report.stack),
      path: ClientErrors.clean(report.path, 200),
      version: ClientErrors.clean(report.version, 100),
      userAgent: ClientErrors.clean(report.userAgent, 300),
      userId: this.userId || null
    });
  }
});

DDPRateLimiter.addRule({
  type: 'method',
  name: 'reportClientError',
  connectionId: function() { return true; }
}, ClientErrors.perMinute, 60 * 1000);
