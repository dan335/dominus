Meteor.methods({
  getGameInfo: function(gameId) {
    check(gameId, String);
    return Games.findOne(gameId);
  }
})
