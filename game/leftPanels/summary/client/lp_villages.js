Template.lp_villages.helpers({
	villages: function() {
		return LeftPanelVillages.find({playerId:Session.get('playerId')}, {sort: {name: 1}});
	},
});

Template.lp_village.helpers({
	unit_count: function() {
		var self = this;
		var unit_count = 0;
		_s.armies.types.forEach(function(type) {
			unit_count += self[type];
		});
		return unit_count;
	},

	timeTilFinished: function() {
		var self = this;
		if (this && this.under_construction) {
			Session.get('refresh_time_field')
			let timeToBuild = _gs.villages(Session.get('gameId'), 'cost.level'+(self.level+1)+'.timeToBuild');
			//var timeToBuild = s.village.cost['level'+(self.level+1)].timeToBuild
			var finishAt = moment(new Date(self.constructionStarted)).add(timeToBuild, 'ms')
			if (moment().isAfter(finishAt)) {
				return 'soon'
			} else {
				return finishAt.fromNow()
			}
		}
	}
});
