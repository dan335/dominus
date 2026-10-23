// Refuses a subscription that leaves out any of its publication's arguments
// (Oct 2026).
//
// Many publications put an argument straight into a query, like
// Players.find({gameId: gameId}). When a client leaves the argument out it is
// undefined: Mongo drops the field and matches every document, while Meteor's
// matcher treats it as "field is missing" and matches none. With the oplog on,
// the oplog driver throws ("The Mongo server and the Meteor query disagree")
// and never becomes ready, and from then on every method that writes to that
// collection waits forever on its write fence, until the server restarts.
//
// The browser always passes every argument (an undefined value arrives as
// null, which Mongo and Meteor agree on), so only a hand-made subscription is
// refused here. Runs at startup, after every package has registered its
// publications.

Meteor.startup(function() {
  _.each(Meteor.server.publish_handlers, function(handler, name) {
    if (handler.length === 0 || handler.publicationGate) {
      return;
    }

    var gated = function() {
      if (arguments.length < handler.length) {
        throw new Meteor.Error(400, 'Missing argument');
      }
      return handler.apply(this, arguments);
    };
    gated.publicationGate = true;
    Meteor.server.publish_handlers[name] = gated;
  });
});
