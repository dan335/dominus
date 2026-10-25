// send_gold_to runs on the client too, so the gold moves at once. It stays a
// plain function: the simulation is sync and the server's part is async (see
// "Async conversion" in CLAUDE.md).

// throws unless player can send amount to playerId, and returns it as a number
var goldToSend = function(player, playerId, amount) {
	if (!player) {
		throw new Meteor.Error('Player not found.');
	}

	amount = Number(amount)

	if (isNaN(amount)) {
		throw new Meteor.Error('Enter a number.')
	}

	if (amount > player.gold) {
		throw new Meteor.Error('You do not have enough gold.')
	}

	if (amount <= 0) {
		throw new Meteor.Error('Number must be greater than 0.')
	}

	if (!_.contains(player.allies_below, playerId)) {
		throw new Meteor.Error('Can only send gold to vassals.');
	}

	return amount;
};

Meteor.methods({
  send_gold_to: function(gameId, playerId, amount) {
    check(amount, Match.OneOf(String, Number));
    var self = this;

    check(gameId, String);
    check(playerId, String);

		var find = {gameId:gameId, userId:self.userId};
		var options = {fields: {gold:1, allies_below:1, username:1, castle_id:1, x:1, y:1}};

		if (this.isSimulation) {
			var player = Players.findOne(find, options);
			amount = goldToSend(player, playerId, amount);
			var tax = amount * _s.income.sendToVassalTax;
			if (!Players.update({_id:player._id, gold:{$gte:amount}}, {$inc: {gold: amount * -1}})) {
				throw new Meteor.Error('You do not have enough gold.')
			}
			Players.update(playerId, {$inc: {gold: amount - tax}})
			return amount - tax;
		}

		return (async () => {
			var player = await Players.findOneAsync(find, options);
			amount = goldToSend(player, playerId, amount);

			var tax = amount * _s.income.sendToVassalTax;

			// atomically debit the sender, only if they still have enough gold.
			// The amount > player.gold check above is a separate read, so without
			// this two concurrent send_gold_to calls could both pass it and drive
			// the sender's balance negative. Credit the recipient only after the
			// debit actually applied.
			var debited = await Players.updateAsync({_id:player._id, gold:{$gte:amount}}, {$inc: {gold: amount * -1}})
			if (!debited) {
				throw new Meteor.Error('You do not have enough gold.')
			}

			await Players.updateAsync(playerId, {$inc: {gold: amount - tax}})

			await Games.updateAsync(gameId, {$inc: {taxesCollected:tax}});

			// send alert
			var from = player._id;
			var to = playerId;
			dAlerts.alert_receivedGoldFrom(gameId, to, from, amount, tax);
			dAlerts.gAlert_sentGold(gameId, from, to, amount, tax);

			return amount - tax;
		})();
	}
});


if (Meteor.isServer) {
  var send_gold_toRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'send_gold_to'
  }
  DDPRateLimiter.addRule(send_gold_toRule, 5, 5000);
}
