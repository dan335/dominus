Template.chatroom_member.helpers({
	// if I am owner and other user is admin show make owner button
	showMakeOwnerButton: function() {
		let playerId = Session.get('playerId');
		var member_id = Template.currentData()._id
		var owner_id = Template.parentData(1).owner
		var admins = Template.parentData(1).admins
		var room_type = Template.parentData(1).type

		if (room_type == 'king' || room_type == 'everyone') {
			return false
		}

		if (playerId == member_id) {
			return false
		}

		if (playerId == owner_id) {
			if (_.contains(admins, member_id)) {
				return true
			}
		}

		return false
	},

	// if I am owner or admin and other user is not admin show make owner button
	showMakeAdminButton: function() {
		let playerId = Session.get('playerId');
		var member_id = Template.currentData()._id
		var owner_id = Template.parentData(1).owner
		var admins = Template.parentData(1).admins
		var room_type = Template.parentData(1).type

		if (room_type == 'king' || room_type == 'everyone') {
			return false
		}

		if (playerId == member_id) {
			return false
		}

		// if I am owner or admin
		if (playerId == owner_id || _.contains(admins, playerId)) {
			// if other user is not owner or admin
			if (member_id != owner_id) {
				if (!_.contains(admins, member_id)) {
					return true
				}
			}
		}

		return false
	},


	// if i cam owner and user is admin
	showRemoveAdminButton: function() {
		let playerId = Session.get('playerId');
		var member_id = Template.currentData()._id
		var owner_id = Template.parentData(1).owner
		var admins = Template.parentData(1).admins
		var room_type = Template.parentData(1).type

		if (room_type == 'king' || room_type == 'everyone') {
			return false
		}

		if (playerId == member_id) {
			return false
		}

		if (playerId == owner_id) {
			if (_.contains(admins, member_id)) {
				return true
			}
		}

		return false
	},


	// if i am owner - can kick anyone
	// if i am admin - can kick not admin
	showKickButton: function() {
		let playerId = Session.get('playerId');
		var member_id = Template.currentData()._id
		var owner_id = Template.parentData(1).owner
		var admins = Template.parentData(1).admins
		var room_type = Template.parentData(1).type

		if (room_type == 'king' || room_type == 'everyone') {
			return false
		}

		if (playerId == member_id) {
			return false
		}

		// if i am owner
		if (playerId == owner_id) {
			return true
		}

		// if i am admin
		if (_.contains(admins, playerId)) {
			if (!_.contains(admins, member_id)) {
				if (owner_id != member_id) {
					return true
				}
			}
		}

		return false
	}
})



Template.chatroom_member.events({
	'click .makeOwnerButton': function(event, template) {
		event.preventDefault();
		Meteor.call('chatroomMakeOwner', Session.get('gameId'), Template.parentData(1)._id, Template.currentData()._id)
	},


	'click .makeAdminButton': function(event, template) {
		event.preventDefault();
		Meteor.call('chatroomMakeAdmin', Session.get('gameId'), Template.parentData(1)._id, Template.currentData()._id)
	},


	'click .removeAdminButton': function(event, template) {
		event.preventDefault();
		Meteor.call('chatroomRemoveAdmin', Session.get('gameId'), Template.parentData(1)._id, Template.currentData()._id)
	},


	'click .kickButton': function(event, template) {
		event.preventDefault();
		Meteor.call('kickFromChatroom', Session.get('gameId'), Template.parentData(1)._id, Template.currentData()._id)
	},
})
