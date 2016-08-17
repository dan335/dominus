Template.tree_panel.helpers({
	tree: function() {
		let gameId = Session.get('gameId');
		if (gameId) {
			let game = Games.findOne(gameId, {fields: {tree:1}});
			if (game && game.tree) {
				return game.tree;
			}
		}
	}
})

Template.tree_panel.rendered = function() {
	this.firstNode._uihooks = leftPanelAnimation
}
