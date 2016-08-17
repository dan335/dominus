dMarket.createMarket = function(gameId) {
  Market.remove({gameId:gameId});
  Markethistory.remove({gameId:gameId});

  _s.market.types.forEach(function(type) {
    Market.insert({
      gameId:gameId,
      type: type,
      price: _s.market.startPrice[type]
    });
  });
}



//called after buying or selling resource to update market price
//buy is false if selling true if buying
dMarket.update_market_price = function(gameId, type, quantity, buy) {
	check(type, String);
	check(quantity, validNumber);
	check(buy, Boolean);
	check(gameId, String);

	var resource = Market.findOne({gameId:gameId, type:type}, {fields: {price:1}});
	if (resource) {
		var price = resource.price;

		if (!buy) {
			quantity = quantity * -1;
		}

		price = price * Math.pow(_s.market.increment + 1, quantity);

		check(price, validNumber);

		Market.update(resource._id, {$set: {price:price}});
	}
};








if (process.env.DOMINUS_WORKER == 'true') {
  Queues.record_market_history.process(4, Meteor.bindEnvironment(function(job) {
    dMarket.record_market_history(job.data.gameId, job.data.quantity)
    return Promise.resolve();
  }));
}


dMarket.record_market_history = function(gameId, quantity) {
	check(quantity, validNumber);
	check(gameId, String);

	var begin = moment().startOf('hour').toDate()
	var end = moment().endOf('hour').toDate()

  let price = {};
	Market.find({gameId:gameId}, {fields: {price:1, type:1}}).forEach(function(m) {
		price[m.type] = m.price;
	})

  let find = {created_at: {$gte: begin, $lt: end}, gameId:gameId};
  Markethistory.upsert(find, {
    $inc: {quantity:quantity},
    $set: {price:price},
    $setOnInsert: {created_at:new Date(), gameId:gameId}
  });
}
