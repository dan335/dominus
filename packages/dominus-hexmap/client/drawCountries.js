Template.drawCountries.helpers({
  countries: function() {
    var countries = Session.get('countryIdsOnscreen');
    if (countries) {
      var countryIds = _.pluck(countries, '_id');
      return Countries.find({_id: {$in: countryIds}});
    }
	},

  isFirstPath: function() {
		return Template.parentData(1).paths[0].length == this.length;
	},

  pathPoints: function() {
		var points = '';
		_.each(this, function(point) {
			points += ' '+point.x+','+point.y;
		})
		return points;
	},

  url: function() {
    if (this && this.image && this.imageWithCoords) {
      let playerId = Session.get('playerId');
      let gameId = Session.get('gameId');

      let sp_show_coords = false;

      if (playerId) {
        let player = Players.findOne(playerId, {fields: {sp_show_coords:1}});
        if (player) {
          sp_show_coords = player.sp_show_coords;
        }
      }

      if (gameId) {
        let url = '';

        if (Meteor.settings.public.s3.serveBakesFromS3) {

          url += Meteor.settings.public.s3.url + Meteor.settings.public.s3.bakePath;
          url += gameId + '/';

        } else {

          url += '/hexBakes/';

        }

        if (sp_show_coords) {
          url += this.imageWithCoords.filename;
        } else {
          url += this.image.filename;
        }

        url += '.jpg?';
        url += new Date(this.image.created_at).getTime();

        return url;
      }
    }
  }
});




Template.drawCountries.onCreated(function() {
  var self = this;


})
