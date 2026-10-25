// Who may read the server facts (facts-ui). facts-base calls the filter
// synchronously, on Meteor 3 too, so it can't wait on the database: an async
// filter would hand it a promise, which is truthy, and let everyone in. It
// reads the admins from memory instead, kept up to date by an observer.
const adminIds = new Set();

Meteor.users.find({admin: {$exists: true}}, {fields: {admin: 1}}).observeAsync({
  added: function(user) {
    if (user.admin) adminIds.add(user._id); else adminIds.delete(user._id);
  },
  changed: function(user) {
    if (user.admin) adminIds.add(user._id); else adminIds.delete(user._id);
  },
  removed: function(user) {
    adminIds.delete(user._id);
  }
}).catch(function(error) {
  console.error('could not watch the admins for the facts filter', error);
});

Facts.setUserIdFilter(function (userId) {
  return !!userId && adminIds.has(userId);
});
