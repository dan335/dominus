Template.admin_commands.events({
	'click #update_allies_user_button': function(event, template) {
    event.preventDefault();
		var input = template.find('#update_allies_username_input')
		if ($(input).length > 0) {
			Meteor.call('admin_run_update_allies_username', $(input).val())
		}
	},

	'click #cleanupAllKingChatroomsButton': function(event, template) {
    event.preventDefault();
		Meteor.call('admin_cleanupAllKingChatrooms')
	},

	'click #bakeMapButton': function(event, template) {
    event.preventDefault();
		Meteor.call('admin_bakeMap')
	},

	'click #deleteUserButton': function(event, template) {
    event.preventDefault();
		var input = template.find('#deleteUserInput')
		Meteor.call('deleteAccount', $(input).val())
	},

	'click #enemyOnBuildingCheck': function(event, template) {
    event.preventDefault();
		Meteor.call('admin_enemyOnBuildingCheck')
	},

	'click #enemiesTogetherCheck': function(event, template) {
    event.preventDefault();
		Meteor.call('admin_enemiesTogetherCheck')
	},
})
