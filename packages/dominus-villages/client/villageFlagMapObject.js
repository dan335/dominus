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
