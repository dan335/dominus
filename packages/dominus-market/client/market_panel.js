Template.market_panel.helpers({
	grain: function() {
		return Template.instance().marketData.get().grain;
	},

	lumber: function() {
		return Template.instance().marketData.get().lumber;
	},

	ore: function() {
		return Template.instance().marketData.get().ore;
	},

	wool: function() {
		return Template.instance().marketData.get().wool;
	},

	clay: function() {
		return Template.instance().marketData.get().clay;
	},

	glass: function() {
		return Template.instance().marketData.get().glass;
	}
});


Template.market_panel.onCreated(function() {
	var self = this

	self.autorun(function() {
		let gameId = Session.get('gameId');
		if (gameId) {
			Meteor.subscribe('markethistory', gameId);
		}
	});

	self.marketData = new ReactiveVar(null);
	self.autorun(function() {
		let gameId = Session.get('gameId');
		if (gameId) {
			var marketData = {};
			Market.find({gameId:gameId}).forEach(function(resource) {
				marketData[resource.type] = resource.price;
			})
			self.marketData.set(marketData);
		}
	})
});


Template.market_panel.onRendered(function() {
	this.firstNode.parentNode._uihooks = leftPanelAnimation
});
