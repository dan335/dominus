Template.rp_send_gold.helpers({
	username: function() {
		var selected = Session.get('selected');
		if (selected) {
			var castle = Castles.findOne(selected.id, {fields: {username:1}});
			if (castle) {
				return castle.username;
			}
		}
	}
})


Template.rp_send_gold.events({
	'click #send_gold_cancel_button': function(event, template) {
		event.preventDefault();
		Session.set('rp_template', 'rp_info_castle')
	},

	'click #send_gold_submit_button': function(event, template) {
		event.preventDefault();
		var input = template.find('#how_much_input')
		var button = template.find('#send_gold_submit_button')
		var alert = template.find('#send_gold_error_alert')
		var button_html = $('#send_gold_submit_button').html()

		var selected = Session.get('selected');
		if (selected) {

			$(alert).hide()
			$(button).attr('disabled', true)
			$(button).html('Please Wait')

			var castle = Castles.findOne(selected.id, {fields: {playerId:1}})

			Meteor.apply('send_gold_to', [Session.get('gameId'), castle.playerId, $(input).val()], {}, function(error, result) {
				$(button).attr('disabled', false)
				$(button).html(button_html)
				
				if (error) {
					$(alert).show()
					$(alert).html(error.error)
				} else {
					Session.set('rp_template', 'rp_info_castle')
				}
			})
		}

	}
})
