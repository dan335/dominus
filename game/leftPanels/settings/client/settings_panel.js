Template.settings_panel.helpers({
	isPro: function() {
		let playerId = Session.get('playerId');
		if (playerId) {
			let player = Players.findOne(playerId, {fields: {pro:1}});
			if (player) {
				return player.pro;
			}
		}
	},

	numProTokens: function() {
		let user = Meteor.users.findOne(Meteor.userId(), {fields: {proTokens:1}});
		if (user) {
			return user.proTokens;
		}
	},

	username: function() {
		let playerId = Session.get('playerId');
		if (playerId) {
			let player = Players.findOne(playerId, {fields: {username:1}});
			if (player) {
				return player.username;
			}
		}
	},

	myAlertList: function() {
		return myAlertList;
	},

	isChecked: function() {
		var data = Template.currentData();
		var instance = Template.instance();
		if (instance) {
			var hideAlertsMine = instance.hideAlertsMine.get();
			if (!hideAlertsMine) {
				hideAlertsMine = [];
			}
			if (_.contains(hideAlertsMine, data.type)) {
				return 'checked';
			}
		}
	}
})

Template.settings_panel.events({
	'click #activateProButton': function(event, template) {
		event.preventDefault();
		var alert = template.find('#activateProAlert');
		var button = event.currentTarget;
    var buttonText = $(button).text();
		let gameId = Session.get('gameId');

		$(alert).hide();
		$(button).attr('disabled', true);
		$(button).html('<i class="fa fa-refresh fa-spin"></i> Please Wait');

		if (gameId) {
			Meteor.call('activateProToken', gameId, function(error, result) {
				if (error) {
					$(alert).show();
					$(alert).html(error.error);
					$(button).attr('disabled', false);
					$(button).html(buttonText);
				} else {
					$(button).html('Pro Activated');
				}
			})
		}
	},

	'click .gotoStoreLink': function(event, template) {
		event.preventDefault();
		SimpleRouter.go('/store');
	},

	'click .hideAlertCheckbox': function(event, template) {
		var hideAlertCheckbox = event.currentTarget;
    var hideAlert = $(hideAlertCheckbox).is(':checked');
		var alertType = this.type;

		if (hideAlert) {
			Meteor.call('hideAlertMine', Session.get('playerId'), alertType);
		} else {
			Meteor.call('showAlertMine', Session.get('playerId'), alertType);
		}
  },

	'click #toggle_coords_button': function(event, template) {
		event.preventDefault();
		let playerId = Session.get('playerId');
		let player = Players.findOne(playerId, {fields: {sp_show_coords:1}});
		if (player.sp_show_coords) {
			Meteor.call('hide_coords', playerId)
		} else {
			Meteor.call('show_coords', playerId)
		}
	},

	'click #toggle_minimap_button': function(event, template) {
		event.preventDefault();
		let playerId = Session.get('playerId');
		let player = Players.findOne(playerId, {fields: {sp_show_minimap:1}});
		if (player.sp_show_minimap) {
			Meteor.call('hide_minimap', playerId)
		} else {
			Meteor.call('show_minimap', playerId)
		}
	},

	'click #change_username_button': function(event, template) {
		event.preventDefault();
		var input = template.find('#change_username_input')
		var button = template.find('#change_username_button')
		var alert = template.find('#change_username_alert');
		let playerId = Session.get('playerId');

		var error = false
		var msg = ''
		$(alert).hide()
		var username = $(input).val()

		username = username.replace(/[^a-zA-Z0-9_\s]+/g, "");

		if (error) {
			$(alert).show()
			$(alert).html(msg)
		} else {
			var button_html = $(button).html()
			$(button).attr('disabled', true)
			$(button).html('<i class="fa fa-refresh fa-spin"></i> Please Wait')

			Meteor.apply('change_username', [playerId, username], {}, function(error, result) {
				if (error) {
					$(alert).show()
					$(alert).html(error.error)
				} else {
					$(input).val(username)
				}
				$(button).attr('disabled', false)
				$(button).html(button_html)
			});
		}
	},

	'click #delete_account_button': function(event, template) {
		event.preventDefault();
		var button = template.find('#change_username_button');
	},

	'click #deleteAccountButton': function(event, template) {
		event.preventDefault();
		var confirmCont = template.find('#deleteAccountConfirmationContainer')
		var butCont = template.find('#deleteAccountButtonContainer')

		$(butCont).hide();
		$(confirmCont).slideDown(100);
	},

	'click #deleteAccountCancelButton': function(event, template) {
		event.preventDefault();
		var confirmCont = template.find('#deleteAccountConfirmationContainer')
		var butCont = template.find('#deleteAccountButtonContainer')

		$(butCont).slideDown(100);
		$(confirmCont).hide();
	},

	'click #deleteAccountConfirmButton': function(event, template) {
		event.preventDefault();
		var button = event.currentTarget;
    var buttonText = $(button).text();

		$(button).attr('disabled', true)
		$(button).html('<i class="fa fa-refresh fa-spin"></i> Please Wait')

		Meteor.call('deleteGameAccount', Session.get('gameId'), function(error, result) {
			SimpleRouter.go('/games')
		});
	}
});


Template.settings_panel.onCreated(function() {
	var self = this;
	this.hideAlertsMine = new ReactiveVar([]);
	this.autorun(function() {
		let playerId = Session.get('playerId');
		let player = Players.findOne(playerId, {fields: {hideAlertsMine:1}});
		if (player) {
			self.hideAlertsMine.set(player.hideAlertsMine);
		}
	})
});



Template.settings_panel.rendered = function() {
	this.firstNode.parentNode._uihooks = leftPanelAnimation
}
