// doesn't take into account that market is not linear
dMarket.resourcesToGold = function(gameId, resources) {
  check(gameId, String);

  _s.market.types.forEach(function(type) {
    if (resources[type]) {
      check(resources[type], validNumber);
    }
  });

	var worth = 0;

  if (resources.gold) {
    worth = resources.gold;
  }

	var market = Market.find({gameId:gameId}, {fields: {price:1, type:1}});
	market.forEach(function(r) {
    if (resources[r.type]) {
      worth += r.price * resources[r.type];
    }
	});

	return worth;
};



dMarket.total_of_buy = function(gameId, type, quantity) {
	check(type, String)
	check(quantity, validNumber);
  check(gameId, String);

	var resource = Market.findOne({gameId:gameId, type:type}, {fields: {price:1}})
	if (resource) {
		var price = resource.price
		var cost = dMarket.total_of_buy_quick(gameId, quantity, price)
		check(cost, validNumber)
		return cost
	}
	return false
}


dMarket.total_of_buy_quick = function(gameId, quantity, price) {
	check(quantity, validNumber)
	check(price, validNumber);
  check(gameId, String);

	//return cost = price / _s.market.increment * (Math.pow(_s.market.increment + 1, quantity) - 1)
	//return cost = price * (1) * (1 - Math.pow(1 - _s.market.increment, quantity)) / _s.market.increment
	return cost = price * (1+_s.market.sell_tax) / _s.market.increment * (Math.pow(_s.market.increment + 1, quantity) - 1)
}


dMarket.total_of_sell = function(gameId, type, quantity) {
	check(type, String)
	check(quantity, validNumber);
  check(gameId, String);

	var resource = Market.findOne({gameId:gameId, type: type}, {fields: {price:1}})
	if (resource) {

		var price = resource.price

		var cost = price * (1 - Math.pow(1 - _s.market.increment, quantity)) / _s.market.increment
		check(cost, validNumber)
		return cost
	}
	return false
}



dMarket.max_buy = function(gold, price) {
	check(gold, validNumber)
	check(price, validNumber);

	return Math.floor(dMarket.max_buy_withoutRounding(gold, price))
	//return num
}

dMarket.max_buy_withoutRounding = function(gold, price) {
	check(gold, validNumber)
	check(price, validNumber)

	var base = Math.log(_s.market.increment + 1)
	var log = Math.log(gold * _s.market.increment / (price * (1+_s.market.sell_tax)) + 1)
	var num = log / base
	return num
}
