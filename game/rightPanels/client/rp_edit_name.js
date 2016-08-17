Template.rp_edit_name.events({
	'click #edit_name_button': function(event, template) {
		event.preventDefault();
		var name = template.find('#edit_name_input')
		var alert = template.find('#edit_name_error_alert')
		var button = template.find('#edit_name_button')

		$(alert).hide()

		var button_html = $('#edit_name_button').html()
		$(button).attr('disabled', true)
		$(button).html('<i class="fa fa-refresh fa-spin"></i> Please Wait')

		var selected = Session.get('selected');

		if (!selected) {
			return;
		}

		Meteor.apply('edit_name', [selected.type, selected.id, $(name).val(), Session.get('playerId')], {}, function(error, result) {
			$(button).attr('disabled', false)
			$(button).html(button_html)

			if (error) {
				$(alert).show()
				$(alert).html(error.error)
			} else {
				switch(selected.type) {
					case 'capital':
						Session.set('rp_template', 'rp_info_capital');
						break;
					case 'castle':
						Session.set('rp_template', 'rp_info_castle')
						break;
					case 'village':
						Session.set('rp_template', 'rp_info_village')
						break;
					case 'army':
						Session.set('rp_template', 'rp_info_army')
						break;
				}
			}
		})

	},


	'click #edit_name_cancel_button': function(event, template) {
		event.preventDefault();
		var selected = Session.get('selected');

		if (!selected) {
			return;
		}

		switch(selected.type) {
			case 'capital':
				Session.set('rp_template', 'rp_info_capital');
				break;
			case 'castle':
				Session.set('rp_template', 'rp_info_castle')
				break;
			case 'village':
				Session.set('rp_template', 'rp_info_village')
				break;
			case 'army':
				Session.set('rp_template', 'rp_info_army')
				break;
		}
	}
})
