Template.rp_destroy_village_confirm.events({
	'click #destroy_village_button_yes': function(event, template) {
		event.preventDefault();
		var instance = Template.instance();
		if (!instance ) {
			console.error('Instance not set.');
			return false;
		}

		var villageId = instance.villageId;
		if (!villageId) {
			console.error('VillageId not set.');
			return false;
		}

		$('#destroy_village_button_yes').attr('disabled', true)
		$('#destroy_village_button_yes').html('Please Wait');
		Meteor.apply('destroyVillage', [villageId], {}, function(error, result) {
			if (error) {
				console.error(error);
			}
		})
		dInit.deselect();
	},

	'click #destroy_village_button_no': function(event, template) {
		event.preventDefault();
		dInit.returnToSelected();
	},
})


Template.rp_destroy_village_confirm.onCreated(function() {
	var self = this;

	var selected = Session.get('selected');
	if (selected && selected.type == 'village' && selected.id) {
		self.villageId = selected.id;
	} else {
		console.error('Select village first.')
	}
});
