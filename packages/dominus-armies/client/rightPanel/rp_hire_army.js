Template.rp_hire_army.helpers({
	is_village: function() {
		var selected = Session.get('selected');
		if (selected) {
			return selected.type == 'village';
		}
	},

	armyTypes: function() {
		var types = _s.armies.types;
		var selected = Session.get('selected');
		if (selected.type == 'village') {
			if (this.level == 1) {
				types = _.without(types, 'footmen', 'pikemen', 'cavalry', 'catapults');
			}
			if (this.level == 2) {
				types = _.without(types, 'cavalry', 'catapults');
			}
		}
		return types;
	},

	is_owner: function() {
		if (this) {
			if (this.user_id == Meteor.userId()) {
				return true;
			}
		}
	},

	is_ally_below: function() {
		if (this) {
			let playerId = Session.get('playerId');
			let options = {fields: {allies_below: 1}};
			let player = Players.findOne(playerId, options)
			if (player) {
				if (_.indexOf(player.allies_below, this.playerId) != -1) {
					return true;
				}
			}
		}
	},

	resource_cost: function() {
		return dArmies.resourceCost(Session.get('gameId'), get_selected_hiring_units());
	},

	num_units: function(type) {
		if (type) {
			return get_selected_hiring_unit(type);
		}
	},

	max_units: function(type) {
		if(type) {
			return get_hiring_max(type);
		}
	},

	cur_res: function(type) {
		if (type) {
			return round_number(get_hiring_current_resource(type));
		}
	},

	sel_cost: function(type) {
		if (type) {
			return round_number(get_hiring_cost(type));
		}
	},

	final_cost: function(type) {
		if (type) {
			return round_number(get_hiring_final_cost(type));
		}
	},

	is_gold: function(type) {
		return (type == 'gold');
	},

	soldierWorth: function(type) {
		var soldierWorth = Template.instance().soldierWorth.get();
		if (soldierWorth) {
			return soldierWorth[type];
		}
	}
});

Template.rp_hire_army.events({
	'input .hireUnitsInput': function(event, template) {
		var num = Number(event.currentTarget.value);
		var type = this.toString();

		set_selected_hiring_unit(type, num);

		// update slider
		var slider = $('.hire_units_new_slider[data-type='+type+']');
		slider.val(get_selected_hiring_unit(type));
	},

	'click #hire_army_cancel_button': function(event, template) {
		event.preventDefault();
		var selected = Session.get('selected');
		Session.set('rp_template', 'rp_info_'+selected.type);
	},

	'click #hire_army_hire_button': function(event, template) {
		event.preventDefault();
		var alert = template.find('#hire_error');
		var button = template.$('#hire_army_hire_button');
		var button_html = button.html();

		var selected = Session.get('selected');

		if (no_units_are_selected()){
			$(alert).show(100);
			$(alert).html('Set how many soldiers to hire.');
		} else {
			button.attr('disabled', true);
			button.html('Please Wait');

			Meteor.apply('hireArmy', [Session.get('gameId'), get_selected_hiring_units(), this._id, selected.type], {}, function(error, result) {
				if (error) {
					$(alert).show(100);
					$(alert).html(error.error);
					button.attr('disabled', false);
					button.html(button_html);
				} else {
					Session.set('rp_template', 'rp_info_'+selected.type);
				}
			});
		}
	},

	'change .hire_units_new_slider, input .hire_units_new_slider': function(event, template) {
		var num = Number(event.currentTarget.value);
		set_selected_hiring_unit(this.toString(), num);
	},

	'click .sell_all_button': function(event, template) {
		event.preventDefault();
		var type = event.currentTarget.getAttribute('data-type');
		var button = template.$(".sell_all_button[data-type='"+type+"']");

		let fields = {};
		fields[type] = 1;
		let find = {gameId:Session.get('gameId'), userId:Meteor.userId()};
		let player = Players.findOne(find, {fields:fields});

		let gameId = Session.get('gameId');

		var button_html = $(button).html();
		button.attr('disabled', true);
		button.html('Please Wait');
		Meteor.apply('sell_resource', [gameId, type, player[type]], {}, function(error, result) {
			button.attr('disabled', false);
			button.html(button_html);
		});
	}
});


Template.rp_hire_army.onCreated(function() {
	var self = this;
	reset_selected_hiring_units();

	self.isHiringForVassal = new ReactiveVar(false);

	this.autorun(function() {
		var data = Template.currentData();
		if (data) {
			self.isHiringForVassal.set(data.user_id != Meteor.userId())
		} else {
			self.isHiringForVassal.set(false);
		}
	})

	// current
	this.autorun(function() {
		var fields = {};
		_s.market.types_plus_gold.forEach(function(type) {
			fields[type] = 1;
		});

		let find = {userId:Meteor.userId(), gameId:Session.get('gameId')};
		let player = Players.findOne(find, {fields:fields});
		if (player && typeof player.gold != 'undefined') {
			let current = {};
			_s.market.types_plus_gold.forEach(function(type) {
				current[type] = player[type];
			})

			set_hiring_current_resources(current);
		}
	});



	self.soldierWorth = new ReactiveVar(null);
	self.autorun(function() {
		var worth = {};
		let gameId = Session.get('gameId');

		var emptyArmy = {};
		_s.armies.types.forEach(function(type) {
			emptyArmy[type] = 0;
		});

		_s.armies.types.forEach(function(type) {
			var army = cloneObject(emptyArmy);
			army[type] = 1;
			worth[type] = round_number(dArmies.worth(gameId, army));
		});

		self.soldierWorth.set(worth);
	});




	// compute slider max
	this.autorun(function() {

		let gameId = Session.get('gameId');

		_s.armies.types.forEach(function(type) {
			// get current market prices for loop
			var market = {};
			var m = Market.find({}, {fields: {price:1, type:1}});
			if (m && m.count() == _s.market.types.length) {
				m.forEach(function(res) {
					market[res.type] = res.price;
				});
			} else {
				return false;
			}

			// this will keep track of remaining resouces
			var remaining = get_hiring_current_resources();


			// subtract cost of selected units except this type
			var f = {};
			_.each(s.army.types, function(t) {
				if (t != type) {
					f[t] = get_selected_hiring_unit(t);
				}
			});

			// cost of selected army
			var c = dArmies.resourceCost(gameId, f);

			// subtract from remaining
			// same as cost function
			_s.market.types.forEach(function(t) {
				var dif = c[t] - remaining[t];
				if (dif > 0) {
					remaining[t] = 0;
					remaining.gold -= dMarket.total_of_buy_quick(gameId, dif, market[t]);
					// update market price
					market[t] = market[t] * Math.pow(_s.market.increment + 1, dif);
					// if (remaining.gold < 0) {
					// 	console.log('WTF')		// <- how does this happen???
					// }
				} else {
					remaining[t] -= c[t];
				}
			});



			var max = 99999999999;

			// only using resources
			_s.market.types.forEach(function(t) {
				// could be 0
				if (_s.armies.cost[type][t]) {
					var max_type = Math.floor(remaining[t] / _s.armies.cost[type][t]);
					if (max_type < max) {
						max = max_type;
					}
				}
			});

			// get cost of max
			var a = {};
			a[type] = max;
			var c = dArmies.resourceCost(gameId, a);

			// subtract cost from remaining
			_s.market.types.forEach(function(t) {
				remaining[t] -= c[t];
			});



			// run loop until gold is gone
			// each time checking if we can buy another unit
			// TODO: figure out a way to speed this up!!!
			var has_gold_left = true;
			var num_can_buy = 0;  	// start at 1, subtract 1 at end if can't buy any
			while (has_gold_left) {
				num_can_buy++;

				// set needed to 0
				// this is which resources we need to buy with gold to buy another army unit
				var needed = {};
				_s.market.types.forEach(function(t) {
					needed[t] = 0;
				})

				// price for num_can_buy for this army type only
				var a = {};
				a[type] = num_can_buy;
				var price = dArmies.resourceCost(gameId, a);

				// find needed
				_s.market.types.forEach(function(t) {
					var n = price[t] - remaining[t];
					if (n > 0) {
						// we don't have enough cash, need more resources
						needed[t] = n;
					}
				})

				// find gold for needed
				var needed_gold = 0;
				_s.market.types.forEach(function(t) {
					if (needed[t] > 0) {
						needed_gold += dMarket.total_of_buy_quick(gameId, needed[t], market[t]);
					}
				})

				// do we not have enough gold?
				if (needed_gold > remaining.gold) {
					// we cannot buy, finish loop
					has_gold_left = false;
					num_can_buy--;
				}
			}

			set_hiring_max(type, Math.floor(max + num_can_buy));
		});
	});






	// cost
	this.autorun(function() {
		var res_cost = dArmies.resourceCost(Session.get('gameId'), get_selected_hiring_units());
		res_cost.gold = 0;

		// send to vassal tax
		if (self.isHiringForVassal && self.isHiringForVassal.get()) {
			_s.market.types.forEach(function(t) {
				res_cost[t] = res_cost[t] * (1 + s.sendToVassalTax);
			})
		}

		// get current market prices for loop
		// keep track because price will go up after each total_of_buy
		var market = {};
		var m = Market.find({}, {fields: {price:1, type:1}});
		if (m && m.count() == _s.market.types.length) {
			m.forEach(function(res) {
				market[res.type] = res.price;
			});
		} else {
			return false;
		}


		// check if final is below 0 for each resource
		_s.market.types.forEach(function(t) {
			var dif = res_cost[t] - get_hiring_current_resource(t);
			if (dif > 0) {
				// if it's below 0 then use gold to buy the rest
				res_cost[t] = get_hiring_current_resource(t);
				// get price
				var p = dMarket.total_of_buy_quick(Session.get('gameId'), dif, market[t]);
				// update market price
				market[t] = market[t] * Math.pow(_s.market.increment + 1, dif);
				res_cost.gold += p;
			}
		});

		set_hiring_costs(res_cost);
	});




	// clamp selected to max
	this.autorun(function() {
		var max = get_hiring_maxs();
		var sel = get_selected_hiring_units();

		_s.armies.types.forEach(function(type) {
			if (sel[type] > max[type]) {
				set_selected_hiring_unit(type, max[type]);
			}
		});
	});




	// final
	this.autorun(function() {
		var final_costs = {};

		_s.market.types_plus_gold.forEach(function(type) {
			var current = get_hiring_current_resource(type);
			var cost = get_hiring_cost(type);
			final_costs[type] = current - cost;
		});

		set_hiring_final_costs(final_costs);
	});

});


Template.rp_hire_army.onRendered(function() {
	var self = this;

	// set slider max
	this.autorun(function() {
		_.each(get_hiring_maxs(), function(max, type) {
			check(max, validNumber);
			var new_slider = $('.hire_units_new_slider[data-type='+type+']');
			new_slider.attr('max', max);
			new_slider.attr('min', 0);
		});
	});
});



/////////////////////////////////////////////////////////////////////////////
// getters and setters
/////////////////////////////////////////////////////////////////////////////


// max
var hiring_maxs = {};
_s.armies.types.forEach(function(type) {
	hiring_maxs[type] = 0;
});
var hiring_maxs_dep = new Tracker.Dependency();

var get_hiring_maxs = function() {
	hiring_maxs_dep.depend();
	return cloneObject(hiring_maxs);
};

var get_hiring_max = function(type) {
	check(type, String);

	hiring_maxs_dep.depend();
	return hiring_maxs[type];
};

var set_hiring_max = function(type, num) {
	check(type, String);
	check(num, validNumber);

	if (hiring_maxs[type] != num) {
		hiring_maxs[type] = num;
		hiring_maxs_dep.changed();
	}
};

var set_hiring_maxs = function(army) {
	check(army, Object);
	var has_changed = false;

	_.each(costs, function(value, key) {
		if (hiring_maxs[key] != value) {
			hiring_maxs[key] = value;
			has_changed = true;
		}
	});

	if (has_changed) {
		hiring_maxs_dep.changed();
	}
};





// final

var hiring_final_costs = {};
_s.market.types_plus_gold.forEach(function(type) {
	hiring_final_costs[type] = 0;
});
var hiring_final_costs_dep = new Tracker.Dependency();

var get_hiring_final_costs = function() {
	hiring_final_costs_dep.depend();
	return cloneObject(hiring_final_costs);
};

var get_hiring_final_cost = function(type) {
	check(type, String);

	hiring_final_costs_dep.depend();
	return hiring_final_costs[type];
};

var set_hiring_final_cost = function(type, num) {
	check(type, String);
	check(num, validNumber);

	if (hiring_final_costs[type] != num) {
		hiring_final_costs[type] = num;
		hiring_final_costs_dep.changed();
	}
};

var set_hiring_final_costs = function(costs) {
	check(costs, Object);
	var has_changed = false;

	_.each(costs, function(value, key) {
		if (hiring_final_costs[key] != value) {
			hiring_final_costs[key] = value;
			has_changed = true;
		}
	});

	if (has_changed) {
		hiring_final_costs_dep.changed();
	}
};






// costs for each army type

var hiring_army_costs = {};
_s.armies.types.forEach(function(type) {
	hiring_army_costs[type] = 0;
});
var hiring_army_costs_dep = new Tracker.Dependency();

var get_hiring_army_costs = function() {
	hiring_army_costs_dep.depend();
	return cloneObject(hiring_army_costs);
};

var get_hiring_army_cost = function(type) {
	check(type, String);

	hiring_army_costs_dep.depend();
	return hiring_army_costs[type];
};

var set_hiring_army_cost = function(type, num) {
	check(type, String);
	check(num, validNumber);

	if (hiring_army_costs[type] != num) {
		hiring_army_costs[type] = num;
		hiring_army_costs_dep.changed();
	}
};

var set_hiring_army_costs = function(costs) {
	check(costs, Object);
	var has_changed = false;

	_.each(costs, function(value, key) {
		if (hiring_army_costs[key] != value) {
			hiring_army_costs[key] = value;
			has_changed = true;
		}
	});

	if (has_changed) {
		hiring_army_costs_dep.changed();
	}
};






// costs

var hiring_costs = {};
_s.market.types_plus_gold.forEach(function(type) {
	hiring_costs[type] = 0;
});
var hiring_costs_dep = new Tracker.Dependency();

var get_hiring_costs = function() {
	hiring_costs_dep.depend();
	return cloneObject(hiring_costs);
};

var get_hiring_cost = function(type) {
	check(type, String);

	hiring_costs_dep.depend();
	return hiring_costs[type];
};

var set_hiring_cost = function(type, num) {
	check(type, String);
	check(num, validNumber);

	if (hiring_costs[type] != num) {
		hiring_costs[type] = num;
		hiring_costs_dep.changed();
	}
};

var set_hiring_costs = function(costs) {
	check(costs, Object);
	var has_changed = false;

	_.each(costs, function(value, key) {
		if (hiring_costs[key] != value) {
			hiring_costs[key] = value;
			has_changed = true;
		}
	});

	if (has_changed) {
		hiring_costs_dep.changed();
	}
};




// users current resources

var hiring_current_resources = {};
_s.market.types_plus_gold.forEach(function(type) {
	hiring_current_resources[type] = 0;
});
var hiring_current_resources_dep = new Tracker.Dependency();

var get_hiring_current_resources = function() {
	hiring_current_resources_dep.depend();
	return cloneObject(hiring_current_resources);
};

var get_hiring_current_resource = function(type) {
	check(type, String);

	hiring_current_resources_dep.depend();
	return hiring_current_resources[type];
};

var set_hiring_current_resource = function(type, num) {
	check(type, String);
	check(num, validNumber);

	if (hiring_current_resources[type] != num) {
		hiring_current_resources[type] = num;
		hiring_current_resources_dep.changed();
	}
};

var set_hiring_current_resources = function(resources) {
	var has_changed = false;

	_.each(resources, function(value, key) {
		if (hiring_current_resources[key] != value) {
			hiring_current_resources[key] = value;
			has_changed = true;
		}
	});

	if (has_changed) {
		hiring_current_resources_dep.changed();
	}
};





// selected units

var selected_hiring_units = {};
_s.armies.types.forEach(function(type) {
	selected_hiring_units[type] = 0;
});
var selected_hiring_units_dep = new Tracker.Dependency();

var get_selected_hiring_units = function() {
	selected_hiring_units_dep.depend();
	return cloneObject(selected_hiring_units);
};

var get_selected_hiring_unit = function(type) {
	check(type, String);
	selected_hiring_units_dep.depend();
	return selected_hiring_units[type];
};

var set_selected_hiring_unit = function(type, num) {
	check(type, String);
	check(num, validNumber);

	if (selected_hiring_units[type] != num) {
		if (num >= 0) {
			selected_hiring_units_dep.changed();
			selected_hiring_units[type] = num;
		}
	}
};

var set_selected_hiring_units = function(army) {
	var has_changed = false;

	_.each(army, function(value, key) {
		if (selected_hiring_units[key] != value) {
			selected_hiring_units[key] = value;
			has_changed = true;
		}
	});

	if (has_changed) {
		selected_hiring_units_dep.changed();
	}
};

var reset_selected_hiring_units = function() {
	var set = {};
	_s.armies.types.forEach(function(type) {
		set[type] = 0;
	});
	set_selected_hiring_units(set);
};

var no_units_are_selected = function() {
	var has_no_units = true;
	_s.armies.types.forEach(function(type) {
		if (selected_hiring_units[type] > 0) {
			has_no_units = false;
		}
	});
	return has_no_units;
};
