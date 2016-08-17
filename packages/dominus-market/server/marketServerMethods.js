Meteor.methods({
	buy_resource: function(gameId, type, quantity) {
		var self = this;

		check(type, String);
		check(quantity, validNumber);
		check(gameId, String);

		if (quantity <= 0) {
			throw new Meteor.Error('Quantity must be above 0.');
		}

		var resource = Market.findOne({gameId:gameId, type:type}, {fields: {_id:1}});
		if (!resource) {
			throw new Meteor.Error('Resource not found.');
		}

		var fields = {};
		fields.gold = 1;
		fields[type] = 1;
		let find = {gameId:gameId, userId:self.userId};
		let player = Players.findOne(find, {fields:fields});

		if (!player) {
			throw new Meteor.Error('Player not found.');
		}

		var cost = dMarket.total_of_buy(gameId, type, quantity);
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
		Players.update(player._id, {$inc:fields});

		if (!this.isSimulation) {
			dMarket.update_market_price(gameId, type, quantity, true)
			Queues.add('record_market_history', {gameId:gameId, quantity:quantity}, {attempts:10, backoff:{type:'fixed', delay:3000}, delay:0, timeout:1000*60*5}, false);

			// save how much tax was collected
			// tax is later distributed to castles
			var sellCost = dMarket.total_of_sell(gameId, type, quantity);
			var tax = parseFloat(cost - sellCost);
			Games.update(gameId, {$inc: {taxesCollected:tax}});
		}

		return cost;
	},


	sell_resource: function(gameId, type, quantity) {
		var self = this;

		check(type, String);
		check(quantity, validNumber);
		check(gameId, String);

		if (quantity <= 0) {
			throw new Meteor.Error('Quantity must be above 0.');
		}

		var resource = Market.findOne({gameId:gameId, type:type}, {fields: {_id:1}})
		if (!resource) {
			throw new Meteor.Error('Resource not found.');
		}

		var fields = {gold:1};
		fields[type] = 1;
		let find = {gameId:gameId, userId:self.userId};
		let player = Players.findOne(find, {fields:fields});

		if (!player) {
			throw new Meteor.Error('Player not found.');
		}

		// does user have enough
		if (player[type] < quantity) {
			throw new Meteor.Error('Not enough resources.');
		}

		var total = dMarket.total_of_sell(gameId, type, quantity)
		if (isNaN(total) || !isFinite(total)) {
			throw new Meteor.Error('Error');
		}

		if (total <= 0) {
			throw new Meteor.Error('Total is less than zero.');
		}

		var fields = {gold:total};
		fields[type] = quantity * -1;
		Players.update(player._id, {$inc:fields})

		if (!this.isSimulation) {
			dMarket.update_market_price(gameId, type, quantity, false);
			Queues.add('record_market_history', {gameId:gameId, quantity:quantity}, {attempts:10, backoff:{type:'fixed', delay:3000}, delay:0, timeout:1000*60*5}, false);
		}

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
