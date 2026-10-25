// server-only, so the browser's Meteor.call waits for the server (see "Async
// conversion" in CLAUDE.md)
Meteor.methods({
	buy_resource: async function(gameId, type, quantity) {
		var self = this;

		check(type, String);
		check(quantity, validNumber);
		check(gameId, String);

		if (quantity <= 0) {
			throw new Meteor.Error('Quantity must be above 0.');
		}

		var resource = await Market.findOneAsync({gameId:gameId, type:type}, {fields: {_id:1}});
		if (!resource) {
			throw new Meteor.Error('Resource not found.');
		}

		var fields = {};
		fields.gold = 1;
		fields[type] = 1;
		let find = {gameId:gameId, userId:self.userId};
		let player = await Players.findOneAsync(find, {fields:fields});

		if (!player) {
			throw new Meteor.Error('Player not found.');
		}

		var cost = await dMarket.total_of_buyAsync(gameId, type, quantity);
		if (isNaN(cost) || !isFinite(cost)) {
			throw new Meteor.Error('Error.');
		}

		if (cost <= 0) {
			throw new Meteor.Error('Cost is less than zero.');
		}

		if (player.gold < cost) {
			throw new Meteor.Error('Not enough gold.');
		}

		var fields = {};
		fields.gold = cost * -1;
		fields[type] = quantity;
		await Players.updateAsync(player._id, {$inc:fields});

		await dMarket.update_market_price(gameId, type, quantity, true)
		await Queues.addAsyncOrLog('record_market_history', {gameId:gameId, quantity:quantity}, {attempts:10, backoff:{type:'fixed', delay:3000}, delay:0, timeout:1000*60*5}, false);

		// save how much tax was collected
		// tax is later distributed to castles
		var sellCost = await dMarket.total_of_sellAsync(gameId, type, quantity);
		var tax = parseFloat(cost - sellCost);
		await Games.updateAsync(gameId, {$inc: {taxesCollected:tax}});

		return cost;
	},


	sell_resource: async function(gameId, type, quantity) {
		var self = this;

		check(type, String);
		check(quantity, validNumber);
		check(gameId, String);

		if (quantity <= 0) {
			throw new Meteor.Error('Quantity must be above 0.');
		}

		var resource = await Market.findOneAsync({gameId:gameId, type:type}, {fields: {_id:1}})
		if (!resource) {
			throw new Meteor.Error('Resource not found.');
		}

		var fields = {gold:1};
		fields[type] = 1;
		let find = {gameId:gameId, userId:self.userId};
		let player = await Players.findOneAsync(find, {fields:fields});

		if (!player) {
			throw new Meteor.Error('Player not found.');
		}

		// does user have enough
		if (player[type] < quantity) {
			throw new Meteor.Error('Not enough resources.');
		}

		var total = await dMarket.total_of_sellAsync(gameId, type, quantity)
		if (isNaN(total) || !isFinite(total)) {
			throw new Meteor.Error('Error');
		}

		if (total <= 0) {
			throw new Meteor.Error('Total is less than zero.');
		}

		var fields = {gold:total};
		fields[type] = quantity * -1;
		await Players.updateAsync(player._id, {$inc:fields})

		await dMarket.update_market_price(gameId, type, quantity, false);
		await Queues.addAsyncOrLog('record_market_history', {gameId:gameId, quantity:quantity}, {attempts:10, backoff:{type:'fixed', delay:3000}, delay:0, timeout:1000*60*5}, false);

		return total;
	},
})

if (Meteor.isServer) {
	var buy_resourceRule = {
	  userId: function() {return true;},
	  type: 'method',
	  name: 'buy_resource'
	}
	DDPRateLimiter.addRule(buy_resourceRule, 10, 5000);
}


var sell_resourceRule = {
  userId: function() {return true;},
  type: 'method',
  name: 'sell_resource'
}
DDPRateLimiter.addRule(sell_resourceRule, 10, 5000);
