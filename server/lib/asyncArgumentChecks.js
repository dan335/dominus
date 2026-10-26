// audit-argument-checks for async methods and publications on Meteor 3.
//
// The audit (check's Match._failIfArgumentsAreNotAllChecked, which ddp-server
// and server/methodGate.js call) runs the handler and then throws unless every
// argument went through check(). An async handler returns at its first await,
// or when it throws, so:
//   - a check() that fails throws inside the handler, which only rejects its
//     promise: the arguments after it are left unchecked, the audit throws
//     "Did not check() all arguments" and the client gets a 500 instead of
//     Match failed [400], and the Match error is a rejection nobody handles;
//   - so is any other error the handler throws before it has checked every
//     argument (not-authorized and the like).
// Meteor 2.16 ran an async handler to its end in the caller's fiber, so the
// audit saw the handler's own error. This does the same: when the audit
// fails and the handler returned a promise, the call waits for the handler
// and ends with its error, or with the audit's if the handler succeeded.
//
// A check() after the first await still doesn't count (the audit has already
// looked); tests/async/check-await.js flags those ('late-check').
(function() {
  var auditSync = Match._failIfArgumentsAreNotAllChecked;

  Match._failIfArgumentsAreNotAllChecked = function(f, context, args, description) {
    var promise = null;
    try {
      return auditSync.call(this, function() {
        var result = f.apply(this, arguments);
        if (result && typeof result.then === 'function') promise = result;
        return result;
      }, context, args, description);
    } catch (auditError) {
      if (!promise) throw auditError;
      return promise.then(function() { throw auditError; });
    }
  };

  Match._failIfArgumentsAreNotAllChecked._promiseAware = true;
})();
