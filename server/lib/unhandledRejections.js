// Node 15 and later end the process on a promise rejection nobody handles
// (Meteor 2.16's Node 14 only warned, and Meteor 3 doesn't add a listener).
// A rejection nobody waits for is a bug, but one method call or job shouldn't
// take the server down for every player, so it is logged, as on Node 14.
// An uncaught exception still ends the process, as it always has.
process.on('unhandledRejection', function(reason) {
  console.error('Unhandled rejection:', reason && reason.stack ? reason.stack : reason);
});
