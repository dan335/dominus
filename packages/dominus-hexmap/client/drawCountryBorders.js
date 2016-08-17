Template.drawCountryBorders.helpers({
  countries: function() {
    return Countries.find();
	},

  pathPoints: function() {
		var points = '';
		_.each(this, function(point) {
			points += ' '+point.x+','+point.y;
		})
		return points;
	},
});
