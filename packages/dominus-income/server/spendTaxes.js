

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.spendTaxes.process(Meteor.bindEnvironment(function(job) {
    spendTaxes(job.data.gameId);
    return Promise.resolve();
  }));
}

var spendTaxes = function(gameId) {
	check(gameId, String);

	// buy resources in the market with the collected taxes
	// this is to keep the market from going down
	let game = Games.findOne(gameId, {fields: {taxesCollected:1}});
	if (game && game.taxesCollected) {
		var taxPerResource = game.taxesCollected / _s.market.types.length;
		check(taxPerResource, validNumber);

		_s.market.types.forEach(function(type) {
			var price = Market.findOne({gameId:gameId, type:type}, {fields: {price:1}}).price;
			var amount = dMarket.max_buy_withoutRounding(taxPerResource, price);
			dMarket.update_market_price(gameId, type, amount, true);
		});
	}

	// reset taxes
	Games.update(gameId, {$set: {taxesCollected:0}});
};
