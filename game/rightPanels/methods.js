Meteor.methods({
	edit_name: function(type, id, name, playerId) {
		check(type, String);
		check(id, String);
		check(name, String);
		check(playerId, String);
		var error = false;

		if (name.length < 1) {
			throw new Meteor.Error('Name is too short.');
		}

		if (name.length > 30) {
			throw new Meteor.Error('Name must be less than 30 characters.');
		}

		name = _.clean(name);

		var collections = {capital: Capitals, castle: Castles, village: Villages, army: Armies};
		var collection = _.has(collections, type) ? collections[type] : null;
		var find = {_id:playerId, userId:this.userId};

		if (this.isSimulation) {
			let player = Players.findOne(find, {fields: {_id:1}});
			if (collection) {
				collection.update({_id:id, playerId:player._id}, {$set: {name: name}});
			}
			return;
		}

		return (async () => {
			let player = await Players.findOneAsync(find, {fields: {_id:1}});
			if (collection) {
				await collection.updateAsync({_id:id, playerId:player._id}, {$set: {name: name}});
			}
		})();
	},
})




if (Meteor.isServer) {
	var edit_nameRule = {
	  userId: function() {return true;},
	  type: 'method',
	  name: 'edit_name'
	}
	DDPRateLimiter.addRule(edit_nameRule, 5, 5000);

	var reportPlayerRule = {
	  userId: function() {return true;},
	  type: 'method',
	  name: 'reportPlayer'
	}
	DDPRateLimiter.addRule(reportPlayerRule, 5, 5000);

}
