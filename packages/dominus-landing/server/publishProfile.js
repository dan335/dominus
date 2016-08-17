Meteor.publish('userImageForProfile', function(userId) {
  return Meteor.users.find(userId, {fields: {avatarFilename:1}});
});



Meteor.publish('userImages', function(userIds) {
  if (userIds === undefined || userIds === null || userIds.length === 0) {
    return this.ready();
  }
  return Meteor.users.find({_id: {$in: userIds}}, {fields: {avatarFilename:1}});
});



var userImageForProfileSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'userImageForProfile'
}
DDPRateLimiter.addRule(userImageForProfileSubRule, 5, 5000);



var userImagesSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'userImages'
}
DDPRateLimiter.addRule(userImagesSubRule, 5, 5000);
