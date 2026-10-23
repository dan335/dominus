// my markers
Meteor.publish('myMarkers', function(playerId) {
  check(playerId, Match.OneOf(String, null));
  if (this.userId) {
    return Markers.find({playerId:playerId, user_id:this.userId});
  } else {
    this.ready();
  }
});

var myMarkersSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'myMarkers'
}
DDPRateLimiter.addRule(myMarkersSubRule, 5, 5000);



Meteor.publish('myMarkerGroups', function(playerId) {
  check(playerId, Match.OneOf(String, null));
  if (this.userId) {
    return MarkerGroups.find({playerId:playerId, user_id:this.userId});
  } else {
    this.ready();
  }
});

var myMarkerGroupsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'myMarkerGroups'
}
DDPRateLimiter.addRule(myMarkerGroupsSubRule, 5, 5000);
