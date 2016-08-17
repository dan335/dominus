Template.lp_lords.helpers({
	lords: function() {
		return LeftPanelLords.find({}, {sort:{name:1}})
	},
})
