Template.capitalFlagMapObject.helpers({
	cleanName: function() {
		return this.name.replace(/[^a-zA-Z0-9]+/g, "");
	},

	friend_or_foe: function() {
		return Template.instance().flagColor.get()
	},

	flag_points: function(x, y) {
		check(x, Match.Integer);
		check(y, Match.Integer);

		var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish);
		var offset_x = 2;
		var offset_y = -27;
		var points = '';
		points = points + (0 + grid.x + offset_x) + ',' + (0 + grid.y + offset_y) + ' ';
		points = points + (0 + grid.x + offset_x) + ',' + (-12 + grid.y + offset_y) + ' ';
		points = points + (22 + grid.x + offset_x) + ',' + (-12 + grid.y + offset_y) + ' ';
		points = points + (0 + grid.x + offset_x) + ',' + (-1 + grid.y + offset_y);
		return points;
	}
});


Template.capitalFlagMapObject.onCreated(function() {
	var self = this;

	self.flagColor = new ReactiveVar(null);
	self.autorun(function() {
    var currentData = Template.currentData();
		let playerId = Session.get('playerId');

    if (currentData && playerId) {
      if (currentData.playerId == playerId) {
        self.flagColor.set('mine');
      } else {
        self.flagColor.set('enemy');
      }
    } else {
			self.flagColor.set('enemy');
		}
	})
});
