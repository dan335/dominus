Meteor.methods({
	setHexScale: function(playerId, num) {
		check(num, validNumber);
		check(playerId, String);
		//this.unblock();

		if (!this.userId) {
			throw new Meteor.Error('not-authorized', 'You must be logged in.');
		}

		num = Math.min(Math.max(Number(num), _s.init.hexScaleMin), _s.init.hexScaleMax);

		// only the caller's own player
		Players.update({_id:playerId, userId:this.userId}, {$set: {hex_scale:num}});
	}
});
