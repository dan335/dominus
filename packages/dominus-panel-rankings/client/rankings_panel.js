var subs = new ReadyManager()

var loadingArray = function() {
	var ret = []
	for (var x=0; x<_s.panels.rankings.perPage; x++) {
		ret.push({name:'loading', username:'loading', is_me:false, x:'', y:'', castle_id:''})
	}
	return ret;
}

Template.rankings_panel.helpers({
	startVassalCounterAt: function() {
		return (Template.instance().vassalsPage.get()-1) * _s.panels.rankings.perPage
	},

	startIncomeCounterAt: function() {
		return (Template.instance().incomePage.get()-1) * _s.panels.rankings.perPage
	},

	startLostSoldiersCounterAt: function() {
		return (Template.instance().lostSoldiersPage.get()-1) * _s.panels.rankings.perPage
	},

	startVillageCounterAt: function() {
		return (Template.instance().villagesPage.get()-1) * _s.panels.rankings.perPage
	},

	startCountriesCounterAt: function() {
		return (Template.instance().countriesPage.get()-1) * _s.panels.rankings.perPage
	},

	top10_income: function() {
		var userId = Meteor.userId();
		if (subs.ready('inc')) {
			return RankingsIncome.find({}, {sort: {income: -1}}).map(function(u) {
				if (u.userId == userId) {
					u.is_me = true
				} else {
					u.is_me = false
				}
				return u
			})
		} else {
			return loadingArray()
		}
	},

	top10_allies: function() {
		var userId = Meteor.userId();
		if (subs.ready('ally')) {
			return RankingsAllies.find({}, {sort: {num_allies_below: -1}}).map(function(u) {
				if (u.userId == userId) {
					u.is_me = true
				} else {
					u.is_me = false
				}
				return u
			})
		} else {
			return loadingArray()
		}
	},

	top10_losses: function() {
		var userId = Meteor.userId();
		if (subs.ready('loss')) {
			return RankingsLostSoldiers.find({}, {sort: {losses_worth: -1}}).map(function(u) {
				if (u.userId == userId) {
					u.is_me = true
				} else {
					u.is_me = false
				}
				return u
			})
		} else {
			return loadingArray()
		}
	},

	dominus: function() {
		if (subs.ready('dominus')) {
			return DominusPlayer.findOne()
		}
	},

	top10_villages: function() {
		var userId = Meteor.userId();
		if (subs.ready('villageRanks')) {
			return RankingsVillages.find({}, {sort: {"income.worth": -1}}).map(function(u) {
				if (u.user_id == userId) {
					u.is_me = true
				} else {
					u.is_me = false
				}
				return u
			})
		} else {
			return loadingArray()
		}
	},

	top10_countries: function() {
		var userId = Meteor.userId();
		if (subs.ready('countryRanks')) {
			return RankingsCountries.find({}, {sort: {"income.worth": -1}}).map(function(u) {
				if (u.user_id == userId) {
					u.is_me = true
				} else {
					u.is_me = false
				}
				return u
			})
		} else {
			return loadingArray()
		}
	},
})


Template.rankings_panel.events({
	'click .gotoUserButton': function(event, template) {
		event.preventDefault()
		event.stopPropagation()

		var id = event.currentTarget.getAttribute('data-castle_id')
		var x = parseInt(event.currentTarget.getAttribute('data-x'));
		var y = parseInt(event.currentTarget.getAttribute('data-y'));

		dInit.select('castle', x, y, id);
		dHexmap.centerOnHex(x, y);
	},

	'click .previousButton': function(event, template) {
		event.preventDefault()
		event.stopPropagation()

		var type = event.currentTarget.getAttribute('data-type')
		if (Template.instance()[type].get() > 1) {
			Template.instance()[type].set(Template.instance()[type].get()-1)
		}
	},

	'click .nextButton': function(event, template) {
		event.preventDefault()
		event.stopPropagation()

		let gameId = Session.get('gameId');
		let game = Games.findOne(gameId, {fields: {numVillages:1, numCountries:1, numPlayers:1}});

		var type = event.currentTarget.getAttribute('data-type')
		if (type == 'villagesPage') {
			if (Template.instance()[type].get() < game.numVillages / _s.panels.rankings.perPage) {
				Template.instance()[type].set(Template.instance()[type].get()+1)
			}
		} else if (type == 'countriesPage') {
			if (Template.instance()[type].get() < game.numCountries / _s.panels.rankings.perPage) {
				Template.instance()[type].set(Template.instance()[type].get()+1)
			}
		} else {
			if (Template.instance()[type].get() < game.numPlayers / _s.panels.rankings.perPage) {
				Template.instance()[type].set(Template.instance()[type].get()+1)
			}
		}

	}
})


Template.rankings_panel.onCreated(function() {
	var self = this

	self.vassalsPage = new ReactiveVar(1)
	self.incomePage = new ReactiveVar(1)
	self.lostSoldiersPage = new ReactiveVar(1)
	self.villagesPage = new ReactiveVar(1);
	self.countriesPage = new ReactiveVar(1);

	self.autorun(function() {
		let gameId = Session.get('gameId');
		subs.subscriptions([
		{
			groupName: 'ally',
			subscriptions: [ Meteor.subscribe('ally_rankings', gameId, self.vassalsPage.get()).ready() ]
		},
		{
			groupName: 'inc',
			subscriptions: [ Meteor.subscribe('income_rankings', gameId, self.incomePage.get()).ready() ]
		},
		{
			groupName: 'loss',
			subscriptions: [ Meteor.subscribe('losses_rankings', gameId, self.lostSoldiersPage.get()).ready() ]
		},{
			groupName: 'villageRanks',
			subscriptions: [
				Meteor.subscribe('village_rankings', gameId, self.villagesPage.get()).ready(),
			]
		},{
			groupName: 'countryRanks',
			subscriptions: [
				Meteor.subscribe('country_rankings', gameId, self.countriesPage.get()).ready(),
			]
		}, {
			groupName: 'dominus',
			subscriptions: [
				Meteor.subscribe('dominus_rankings', gameId).ready()
			]
		}])
	})
})


Template.rankings_panel.rendered = function() {
	this.firstNode.parentNode._uihooks = leftPanelAnimation
}
