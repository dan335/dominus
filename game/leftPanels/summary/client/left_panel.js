Template.left_panel.helpers({
	sMarket: function() {
		return _s.market;
	},

	resources: function() {
		var data = Template.instance().playerData.get();
		var type = Template.currentData();
		if (data) {
			return data[type];
		}
	},

	show_armies_group: function() {
		var data = Template.instance().playerData.get();
		if (data) {
			return data.lp_show_armies;
		}
	},

	show_lords_group: function() {
		var data = Template.instance().playerData.get();
		if (data) {
			return data.lp_show_lords;
		}
	},

	show_allies_group: function() {
		var data = Template.instance().playerData.get();
		if (data) {
			return data.lp_show_allies;
		}
	},

	num_villages: function() {
		return Session.get('num_villages')
	},

	num_vassals: function() {
		var data = Template.instance().playerData.get();
		if (data) {
			return data.num_allies_below;
		}
	},

	sVillages: function() {
		return _s.villages;
	},

	maxVillages: function() {
		return _gs.villages(Session.get('gameId'), 'max_can_have');
	}
})


Template.left_panel.events({
	'click #armies_group_link': function(event, template) {
		event.preventDefault();
		if (Template.instance().playerData.get().lp_show_armies) {
			Meteor.call('hide_armies', Session.get('gameId'))
		} else {
			Meteor.call('show_armies', Session.get('gameId'))
		}
	},

	'click #lords_group_link': function(event, template) {
		event.preventDefault();
		if (Template.instance().playerData.get().lp_show_lords) {
			Meteor.call('hide_lords', Session.get('gameId'))
		} else {
			Meteor.call('show_lords', Session.get('gameId'))
		}
	},

	'click #allies_group_link': function(event, template) {
		event.preventDefault();
		if (Template.instance().playerData.get().lp_show_allies) {
			Meteor.call('hide_allies', Session.get('gameId'))
		} else {
			Meteor.call('show_allies', Session.get('gameId'))
		}
	},

})



Template.left_panel.created = function() {
	var self = this;

	self.playerData = new ReactiveVar({});
	self.autorun(function() {
		var fields = {num_allies_below:1, lp_show_lords:1, lp_show_allies:1, lp_show_armies:1};
		_s.market.types_plus_gold.forEach(function(type) {
				fields[type] = 1;
		});
		self.playerData.set(Players.findOne({gameId:Session.get('gameId'), userId:Meteor.userId()}, {fields: fields}));
	})

	self.autorun(function() {
		var player = Template.instance().playerData.get();
		if (player) {

			if (player.lp_show_lords) {
				Meteor.subscribe('left_panel_lords', Session.get('gameId'), player._id);
			}

			if (player.lp_show_allies) {
				Meteor.subscribe('left_panel_allies', Session.get('gameId'), player._id);
			}
		}
	})
}

Template.left_panel.rendered = function() {
	this.firstNode.parentNode._uihooks = leftPanelAnimation
}
