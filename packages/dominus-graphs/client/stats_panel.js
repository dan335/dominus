var subs = new ReadyManager()

Template.stats_panel.onCreated(function() {
	this.autorun(function() {
		let gameId = Session.get('gameId');
		if (gameId) {
			// spectators don't have stats of their own
			if (Session.get('playerId')) {
				Meteor.subscribe('my_dailystats', gameId);
			}
			Meteor.subscribe('stats_gamestats', gameId);
		}
	})
});


Template.stats_panel.onRendered(function() {
	this.firstNode.parentNode._uihooks = leftPanelAnimation;
});
