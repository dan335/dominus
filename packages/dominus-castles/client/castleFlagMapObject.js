Template.castleFlagMapObject.helpers({
	cleanName: function() {
		return this.name.replace(/[^a-zA-Z0-9]+/g, "");
	},

	cleanUsername: function() {
		return this.username.replace(/[^a-zA-Z0-9 ]+/g, "");
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
