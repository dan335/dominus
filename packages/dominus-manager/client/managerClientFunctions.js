dManager.isPro = function() {
  let playerId = Session.get('playerId');
  let userId = Meteor.userId();
	if (playerId) {
		let player = Players.findOne({playerId:playerId, userId:userId}, {fields: {pro:1}});
		if (player) {
			return player.pro;
		}
	}
  return false;
}


dManager.isProAllGames = function() {
  let user = Meteor.users.findOne(Meteor.userId(), {fields: {pro:1}});
  if (user) {
    return user.pro;
  }
  return false;
}
