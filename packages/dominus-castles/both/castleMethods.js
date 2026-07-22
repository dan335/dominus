Meteor.methods({
  send_gold_to: function(gameId, playerId, amount) {
    var self = this;

    check(gameId, String);
    check(playerId, String);

		var player = Players.findOne({gameId:gameId, userId:self.userId}, {fields: {gold:1, allies_below:1, username:1, castle_id:1, x:1, y:1}})
		if (player) {
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

      if (_.contains(player.allies_below, playerId)) {

				var tax = amount * _s.income.sendToVassalTax;

				// atomically debit the sender, only if they still have enough gold.
				// The amount > player.gold check above is a separate read, so without
				// this two concurrent send_gold_to calls could both pass it and drive
				// the sender's balance negative. Credit the recipient only after the
				// debit actually applied.
				var debited = Players.update({_id:player._id, gold:{$gte:amount}}, {$inc: {gold: amount * -1}})
				if (!debited) {
					throw new Meteor.Error('You do not have enough gold.')
				}

				Players.update(playerId, {$inc: {gold: amount - tax}})

				if (!this.isSimulation) {

          Games.update(gameId, {$inc: {taxesCollected:tax}});

					// send alert
					var from = player._id;
					var to = playerId;
					dAlerts.alert_receivedGoldFrom(gameId, to, from, amount, tax);
					dAlerts.gAlert_sentGold(gameId, from, to, amount, tax);
				}

				return amount - tax;

			} else {
        throw new Meteor.Error('Can only send gold to vassals.');
      }
		} else {
        throw new Meteor.Error('Player not found.');
    }
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
