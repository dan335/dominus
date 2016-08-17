Template.center_on_button.events({
	'click .select_button': function(event, template) {
		check(template.data, {
			selected_type: String,
			selected_id: String,
			x: validNumber,
			y: validNumber
		});

		dInit.select(template.data.selected_type, template.data.x, template.data.y, template.data.selected_id);
	},

	'click .center_on_button': function(event, template) {
		event.preventDefault();
		check(template.data, {
			selected_type: String,
			selected_id: String,
			x: validNumber,
			y: validNumber
		});

		dHexmap.centerOnHex(template.data.x,template.data.y);
	}
})
