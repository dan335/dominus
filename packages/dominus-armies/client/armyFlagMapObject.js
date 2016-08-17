Template.armyFlagMapObject.helpers({
	draw: function() {
		return Template.instance().draw.get();
	},

	flags: function() {
		return Template.instance().flags.get();
	}
});


Template.armyFlagMapObject.onCreated(function() {
  var self = this;

  self.draw = new ReactiveVar(false);
  this.autorun(function() {
    self.draw.set(true);
    var currentData = Template.currentData();

    if (currentData) {
      var find = {x: currentData.x, y: currentData.y, _id: {$ne: currentData._id}};
      var fields = {fields: {last_move_at:1}};
      var armies = Armies.find(find, fields);

			if (armies && armies.count()) {
				armies.forEach(function(res) {
					if (currentData.last_move_at > res.last_move_at) {
						self.draw.set(false);
					}
				});
			}
    }
  });


  self.flags = new ReactiveVar([])
	self.autorun(function() {
    var currentData = Template.currentData();

    if (currentData) {
			let gameId = Session.get('gameId');
      var userId = Meteor.userId();
  		if (userId) {

        var fields = {fields: {lord:1, allies_above:1, allies_below:1, team:1, king:1, vassals:1}};
				let find = {gameId:gameId, userId:userId};
				let player = Players.findOne(find, fields);
  			if (player) {
          var num = [];

          _s.init.relationshipTypes.forEach(function(type) {
            num[type] = 0;
          })

  				Armies.find({x:currentData.x, y:currentData.y}, {fields: {playerId:1}}).forEach(function(res) {

            var relation = dInit.getPlayersRelationship(player, res.playerId);
            num[relation]++;

  				})

  				var flags = []
  				var index = 0
  				var drawNum = false
  				var shape_size = 10 +1
  				var offset = -20

          _s.init.relationshipTypes.forEach(function(type) {
            if (num[type] > 0) {

              drawNum = num[type] > 1;

              offset += shape_size;

              flags[index] = {
                num: num[type],
                offset: offset,
                textOffset: offset+9,
                type: type,
                x: currentData.x,
                y: currentData.y,
                drawNum: drawNum
              }

							index++;
            }
          });

  				self.flags.set(flags)
  			}
  		}
    }
	})
});
