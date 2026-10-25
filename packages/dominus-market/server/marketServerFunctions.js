dMarket.createMarket = async function(gameId) {
  await Market.removeAsync({gameId:gameId});
  await Markethistory.removeAsync({gameId:gameId});

  for (const type of _s.market.types) {
    await Market.insertAsync({
      gameId:gameId,
      type: type,
      price: _s.market.startPrice[type]
    });
  }
}



//called after buying or selling resource to update market price
//buy is false if selling true if buying
dMarket.update_market_price = async function(gameId, type, quantity, buy) {
	check(type, String);
	check(quantity, validNumber);
	check(buy, Boolean);
	check(gameId, String);

	var resource = await Market.findOneAsync({gameId:gameId, type:type}, {fields: {price:1}});
	if (resource) {
		var price = resource.price;

		if (!buy) {
			quantity = quantity * -1;
		}

		price = price * Math.pow(_s.market.increment + 1, quantity);

		check(price, validNumber);

		await Market.updateAsync(resource._id, {$set: {price:price}});
	}
};








if (process.env.DOMINUS_WORKER == 'true') {
  Queues.record_market_history.process(4, async function(job) {
    await dMarket.record_market_history(job.data.gameId, job.data.quantity)
  });
}


dMarket.record_market_history = async function(gameId, quantity) {
	check(quantity, validNumber);
	check(gameId, String);

	var begin = moment(dClock.now()).startOf('hour').toDate()
	var end = moment(dClock.now()).endOf('hour').toDate()

  let price = {};
	for (const m of await Market.find({gameId:gameId}, {fields: {price:1, type:1}}).fetchAsync()) {
		price[m.type] = m.price;
	}

  let find = {created_at: {$gte: begin, $lt: end}, gameId:gameId};
  await Markethistory.upsertAsync(find, {
    $inc: {quantity:quantity},
    $set: {price:price},
    $setOnInsert: {created_at:dClock.now(), gameId:gameId}
  });
}
