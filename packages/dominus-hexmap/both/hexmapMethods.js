Meteor.methods({
	setHexScale: function(playerId, num) {
		check(num, validNumber);
		check(playerId, String);
		this.unblock();
		Players.update(playerId, {$set: {hex_scale:num}});
	}
});
