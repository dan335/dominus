Template.edit_name_button.events({
	'click': function(event, template) {
		event.preventDefault();
		Session.set('rp_template', 'rp_edit_name')
	}
})
