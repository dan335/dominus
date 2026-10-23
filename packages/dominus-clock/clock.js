// Game code reads "now" from dClock instead of new Date(), Date.now() or
// moment(), so tests can fix and advance game time (T6 of the Meteor upgrade
// plan). Untouched, dClock.now() is exactly new Date(). Infrastructure that
// needs real time (the job queue, cron, caches, payments) keeps new Date().

dClock = {
  // ms since the epoch while the clock is fixed, otherwise null
  _fixedAt: null,

  // a new Date for now
  now: function() {
    return this._fixedAt === null ? new Date() : new Date(this._fixedAt);
  },

  // ms since the epoch for now, like Date.now()
  nowMs: function() {
    return this._fixedAt === null ? Date.now() : this._fixedAt;
  },

  // --- tests only ---

  isFixed: function() {
    return this._fixedAt !== null;
  },

  // stops the clock at date (a Date or ms)
  set: function(date) {
    refuseInProduction('dClock.set');
    var ms = date instanceof Date ? date.getTime() : date;
    if (typeof ms !== 'number' || !isFinite(ms)) {
      throw new Error('dClock.set needs a Date or a number of ms');
    }
    this._fixedAt = ms;
  },

  // moves a fixed clock forward by ms
  advance: function(ms) {
    refuseInProduction('dClock.advance');
    if (this._fixedAt === null) {
      throw new Error('dClock.advance needs a fixed clock: call dClock.set first');
    }
    if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) {
      throw new Error('dClock.advance needs a number of ms, 0 or more');
    }
    this._fixedAt += ms;
  },

  // back to the real clock
  reset: function() {
    this._fixedAt = null;
  }
};

// Fixing time or the random source on a live server would freeze the game.
refuseInProduction = function(what) {
  if (Meteor.isServer && Meteor.isProduction) {
    throw new Error(what + ' is for tests and is refused in production');
  }
};
