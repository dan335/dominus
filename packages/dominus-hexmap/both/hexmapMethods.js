Meteor.methods({
	// sync, with the server's part async: see dominus-markers/lib/methodsMarkers.js
	setHexScale: function(playerId, num) {
		check(num, validNumber);
		check(playerId, String);
		//this.unblock();

		if (!this.userId) {
			throw new Meteor.Error('not-authorized', 'You must be logged in.');
		}

		num = Math.min(Math.max(Number(num), _s.init.hexScaleMin), _s.init.hexScaleMax);

		// only the caller's own player
		var selector = {_id:playerId, userId:this.userId};
		if (this.isSimulation) {
			Players.update(selector, {$set: {hex_scale:num}});
			return;
		}
		return (async () => {
			await Players.updateAsync(selector, {$set: {hex_scale:num}});
		})();
	}
});
