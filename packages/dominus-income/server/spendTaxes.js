

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.spendTaxes.process(async function(job) {
    await spendTaxes(job.data.gameId);
  });
}

var spendTaxes = async function(gameId) {
	check(gameId, String);

	// buy resources in the market with the collected taxes
	// this is to keep the market from going down
	let game = await Games.findOneAsync(gameId, {fields: {taxesCollected:1}});
	if (game && game.taxesCollected) {
		var taxPerResource = game.taxesCollected / _s.market.types.length;
		check(taxPerResource, validNumber);

		for (const type of _s.market.types) {
			var price = (await Market.findOneAsync({gameId:gameId, type:type}, {fields: {price:1}})).price;
			var amount = dMarket.max_buy_withoutRounding(taxPerResource, price);
			await dMarket.update_market_price(gameId, type, amount, true);
		}
	}

	// reset taxes
	await Games.updateAsync(gameId, {$set: {taxesCollected:0}});
};
