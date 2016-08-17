Template.rp_disbandArmy.events({
	'click #disband_army_button_yes': function(event, template) {
		var selected = Session.get('selected');
		if (selected) {
			Meteor.call('disbandArmy', Session.get('gameId'), selected.id);
			dInit.deselect();
		}
	},

	'click #disband_army_button_no': function(event, template) {
		//Session.set('rp_template', 'rp_info_army')
		dInit.returnToSelected();
	},
})


// not needed?
// Template.rp_disbandArmy.onCreated(function() {
// 	//Session.set('mouse_mode', 'modal')
// }
