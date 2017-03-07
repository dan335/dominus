Template.castleFlagMapObject.helpers({
	cleanName: function() {
		return this.name.replace(/[^a-zA-Z0-9_\s]+/g, "");
	},

	cleanUsername: function() {
		return this.username.replace(/[^a-zA-Z0-9_\s]+/g, "");
	},

	friend_or_foe: function() {
		return Template.instance().flagColor.get()
	},

	flag_points: function(x, y) {
		check(x, Match.Integer);
		check(y, Match.Integer);

		var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish);
		var offset_x = _s.store.castles[this.image].flag_offset_x;
		var offset_y = _s.store.castles[this.image].flag_offset_y;
		var points = '';
		points = points + (0 + grid.x + offset_x) + ',' + (0 + grid.y + offset_y) + ' ';
		points = points + (0 + grid.x + offset_x) + ',' + (-12 + grid.y + offset_y) + ' ';
		points = points + (22 + grid.x + offset_x) + ',' + (-12 + grid.y + offset_y) + ' ';
		points = points + (0 + grid.x + offset_x) + ',' + (-1 + grid.y + offset_y);
		return points;
	},

	flagCoordsX: function(x, y) {
		check(x, Match.Integer);
		check(y, Match.Integer);

		var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish);
		var offset_x = _s.store.castles[this.image].flag_offset_x;

		return grid.x + offset_x;
	},

	flagCoordsY: function(x, y) {
		check(x, Match.Integer);
		check(y, Match.Integer);

		var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish);
		var offset_y = _s.store.castles[this.image].flag_offset_y;

		return grid.y + offset_y - 12;
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

Template.castleFlagMapObject.onCreated(function() {
	var self = this;

	self.flagColor = new ReactiveVar(null);
	self.autorun(function() {
    let data = Template.currentData();
    if (data && data.playerId) {
			self.flagColor.set(dInit.getRelationshipClient(data.playerId));
    }
	});
});
