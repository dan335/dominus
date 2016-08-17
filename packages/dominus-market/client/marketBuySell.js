Template.marketBuySell.helpers({
  isChecked: function(data) {
    let sel = Template.instance().resourceType.get();
    if (sel == data.hash.type) {
      return 'checked';
    }
  },

  quantity: function() {
    return Template.instance().quantity.get();
  },

  costToBuy: function() {
    return Template.instance().costToBuy.get();
  },

  valueOfSell: function() {
    return Template.instance().valueOfSell.get();
  },

  resourceType: function() {
    return Template.instance().resourceType.get();
  },

  canBuy: function() {
    if (!Template.instance().canBuy.get()) {
      return 'disabled';
    }
  },

  canSell: function() {
    if (!Template.instance().canSell.get()) {
      return 'disabled';
    }
  },

  tax_precent: function() {
		return _s.market.sell_tax * 100;
	},
})

Template.marketBuySell.events({
  'change .resourseTypeRadio': function(event, template) {
    let element = template.find('.resourseTypeRadio:checked');
    let type = $(element).val();
    Template.instance().resourceType.set(type);
  },

  'change #marketQuantityInput, input #marketQuantityInput': function(event, template) {
    let input = template.find('#marketQuantityInput');
    let quantity = Number(input.value);
    if (quantity < 0) {
      quantity = 0;
    }
    Template.instance().quantity.set(quantity);
  },

  'click #maxBuyButton': function(event, template) {
    event.preventDefault();

    let playerId = Session.get('playerId');
    let gameId = Session.get('gameId');
    if (playerId && gameId) {
      let type = Template.instance().resourceType.get();
      let resource = Market.findOne({gameId:gameId, type:type}, {fields: {price:1}});
      let player = Players.findOne(playerId, {fields: {gold:1}});
      if (type && resource && player) {
        let num = dMarket.max_buy(player.gold, resource.price);
        num = Math.floor(num);
        Template.instance().quantity.set(num);
      }
    }
  },

  'click #maxSellButton': function(event, template) {
    event.preventDefault();

    let playerId = Session.get('playerId');
    if (playerId) {
      let type = Template.instance().resourceType.get();
  		let fields = {};
  		fields[type] = 1;
  		let player = Players.findOne(playerId, {fields:fields});
      if (player) {
        let num = player[type];
        num = Math.floor(num);
        Template.instance().quantity.set(num);
      }
    }
  },

  'click #marketBuyButton': function(event, template) {
    event.preventDefault();

    let errorAlert = template.find('#marketErrorAlert');
    let successAlert = template.find('#marketSuccessAlert');
    var button = event.currentTarget;
    var buttonText = $(button).text();

    let instance = Template.instance();
    let quantity = instance.quantity.get();
    let type = instance.resourceType.get();
    let gameId = Session.get('gameId');

    $(errorAlert).hide();
    $(successAlert).hide();
    $(button).attr('disabled', true);
		$(button).html('<i class="fa fa-refresh fa-spin"></i> Please Wait');

    Meteor.apply('buy_resource', [gameId, type, quantity], {}, function(error, cost) {
      if (error) {
        $(errorAlert).show();
        $(errorAlert).html(error.error);
      } else {
        $(successAlert).show();
        $(successAlert).html('Bought '+round_number_2(quantity)+' '+type+' for '+round_number_2(cost)+' gold.');
      }

      $(button).attr('disabled', false);
      $(button).html(buttonText);
    });
  },

  'click #marketSellButton': function(event, template) {
    event.preventDefault();

    let errorAlert = template.find('#marketErrorAlert');
    let successAlert = template.find('#marketSuccessAlert');
    var button = event.currentTarget;
    var buttonText = $(button).text();

    let instance = Template.instance();
    let quantity = instance.quantity.get();
    let type = instance.resourceType.get();
    let gameId = Session.get('gameId');

    $(errorAlert).hide();
    $(successAlert).hide();
    $(button).attr('disabled', true);
		$(button).html('<i class="fa fa-refresh fa-spin"></i> Please Wait');

    Meteor.apply('sell_resource', [gameId, type, quantity], {}, function(error, total) {
      if (error) {
        $(errorAlert).show();
        $(errorAlert).html(error.error);
      } else {
        $(successAlert).show();
        $(successAlert).html('Sold '+round_number_2(quantity)+' '+type+' for '+round_number_2(total)+' gold.');
      }

      $(button).attr('disabled', false);
      $(button).html(buttonText);
    });
  },
});


Template.marketBuySell.onCreated(function() {
  var self = this;

  this.resourceType = new ReactiveVar('grain');
  this.quantity = new ReactiveVar(0);
  this.costToBuy = new ReactiveVar(null);
  this.valueOfSell = new ReactiveVar(null);
  this.canBuy = new ReactiveVar(false);
  this.canSell = new ReactiveVar(false);

  // cost to buy
  this.autorun(function() {
    let quantity = self.quantity.get();
    let type = self.resourceType.get();
    let gameId = Session.get('gameId');
    if (type && gameId) {
      if (!isNaN(quantity) && quantity >= 0) {
        var costToBuy = dMarket.total_of_buy(gameId, type, quantity);
        self.costToBuy.set(costToBuy);
      } else {
        self.costToBuy.set(0);
      }
    }
  });

  // total of sell
  this.autorun(function() {
    let quantity = self.quantity.get();
    let type = self.resourceType.get();
    let gameId = Session.get('gameId');
    if (type && gameId) {
      if (!isNaN(quantity) && quantity >= 0) {
        var valueOfSell = dMarket.total_of_sell(gameId, type, quantity);
        self.valueOfSell.set(valueOfSell);
      } else {
        self.valueOfSell.set(0);
      }
    }
  });

  // can buy
  this.autorun(function() {
    var canBuy = false;
    let playerId = Session.get('playerId');
    let costToBuy = self.costToBuy.get();
    if (playerId) {
      if (!isNaN(costToBuy)) {
        let player = Players.findOne(playerId, {fields: {gold:1}});
        if (player) {
          if (player.gold >= costToBuy) {
            canBuy = true;
          }
        }
      }
    }
    self.canBuy.set(canBuy);
  });

  // can sell
  this.autorun(function() {
    var canSell = false;
    let playerId = Session.get('playerId');
    let quantity = self.quantity.get();
    let type = self.resourceType.get();
    if (playerId && type) {
      if (!isNaN(quantity)) {
        let fields = {};
        fields[type] = 1;
        let player = Players.findOne(playerId, {fields:fields});
        if (player) {
          if (player[type] >= quantity) {
            canSell = true;
          }
        }
      }
    }
    self.canSell.set(canSell);
  })
});
