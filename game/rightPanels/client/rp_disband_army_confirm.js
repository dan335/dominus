Template.rp_disband_army_confirm.events({
	'click #disband_army_button_yes': function(event, template) {
		event.preventDefault();
		var selected = Session.get('selected');
		if (selected) {
			$('#disband_army_button_yes').attr('disabled', true)
			$('#disband_army_button_yes').html('<i class="fa fa-refresh fa-spin"></i> Please Wait')
			Meteor.call('disband_army', selected.id);
			SimpleRouter.go('/game/'+Session.get('gameId'));
		}
	},

	'click #disband_army_button_no': function(event, template) {
		event.preventDefault();
		Session.set('rp_template', 'rp_info_army')
	},
})


Template.rp_disband_army_confirm.created = function() {
	Session.set('mouse_mode', 'modal')
}
