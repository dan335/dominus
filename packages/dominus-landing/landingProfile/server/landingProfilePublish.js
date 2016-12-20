// publish user => ProfileUser
// Players and Games that are over
Meteor.publish('userProfile', function(userId) {
	var fields = {
		username:1,
		rankingRegular:1,
		rankingPro:1,
		createdAt:1
	};
	var query = Meteor.users.find(userId, {fields: fields});
	Mongo.Collection._publishCursor(query, this, 'profileuser');

	let pFields = {wonGame:1, gameId:1, rankByIncome:1, rankByVassals:1, userId:1}
	let playerQuery = Players.find({userId:userId, gameIsOver:true}, {fields:pFields});

	let gameIds = [];
	playerQuery.forEach(function(player) {
		gameIds.push(player.gameId);
	});

	let gFields = {endDate:1, hasEnded:1, name:1, numPlayers:1, maxPlayers:1, winningPlayer:1};
	let gameQuery = Games.find({_id: {$in:gameIds}}, {fields:gFields});

	return [playerQuery, gameQuery];
});

var userProfileSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'userProfile'
}
DDPRateLimiter.addRule(userProfileSubRule, 5, 5000);
