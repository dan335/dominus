Template.lp_castle.helpers({
	castle: function() {
		var res = LeftPanelCastle.findOne({user_id:Meteor.userId()})
		if (res) {
			res.unit_count = 0

			_.each(s.army.types, function(type) {
				res.unit_count += res[type]
			})

			return res
		}
		return false
	},
})
