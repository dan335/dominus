Template.lp_allies.helpers({
	allies: function() {
		return LeftPanelAllies.find({}, {sort:{name:1}})
	},
})
