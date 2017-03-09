Template.villageFlagMapObject.helpers({
	friend_or_foe: function() {
		return Template.instance().flagColor.get()
	},

	flag_points: function(x, y) {
		check(x, Match.Integer);
		check(y, Match.Integer);

		var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish);
		var offset_x = 0;
		var offset_y = 0;
		var points = '';
		points = points + (0 + grid.x + offset_x) + ',' + (0 + grid.y + offset_y) + ' '
		points = points + (0 + grid.x + offset_x) + ',' + (-20 + grid.y + offset_y) + ' '
		points = points + (18 + grid.x + offset_x) + ',' + (-20 + grid.y + offset_y) + ' '
		points = points + (0 + grid.x + offset_x) + ',' + (-11 + grid.y + offset_y)
		return points;
	},

	flagCoordsX: function(x, y) {
		check(x, Match.Integer);
		check(y, Match.Integer);

		var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish);
		var offset_x = 0;

		return grid.x + offset_x;
	},

	flagCoordsY: function(x, y) {
		check(x, Match.Integer);
		check(y, Match.Integer);

		var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish);
		var offset_y = -23;

		return grid.y + offset_y;
	},

	flagImage: function() {
		var flagName = '';
		switch(Template.instance().flagColor.get()) {
			case 'mine':
				flagName = 'castleFlagMine.png';
				break;
			case 'enemy_ally':
				flagName = 'castleFlagEnemyAlly.png';
				break;
			case 'enemy':
				flagName = 'castleFlagEnemy.png';
				break;
			case 'vassal':
				flagName = 'castleFlagVassal.png';
				break;
			case 'direct_vassal':
				flagName = 'castleFlagDirectVassal.png';
				break;
			case 'lord':
				flagName = 'castleFlagLord.png';
				break;
			case 'direct_lord':
				flagName = 'castleFlagDirectLord.png';
				break;
			case 'king':
				flagName = 'castleFlagKing.png';
				break;
		}

		return flagName;
	}
})

Template.villageFlagMapObject.onCreated(function() {
	var self = this;

	self.flagColor = new ReactiveVar(null);
	self.autorun(function() {
    let data = Template.currentData();
    if (data && data.playerId) {
			self.flagColor.set(dInit.getRelationshipClient(data.playerId));
    }
	});
});
