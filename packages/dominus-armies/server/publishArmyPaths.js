// always subscribe to your own army paths
Meteor.publish('myArmyPaths', function(gameId) {
  if (this.userId) {
    return Armypaths.find({gameId:gameId, user_id:this.userId});
  } else {
    return this.ready();
  }
});

var myArmyPathsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'myArmyPaths'
}
DDPRateLimiter.addRule(myArmyPathsSubRule, 5, 5000);
