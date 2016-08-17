Template.chatroom_list.helpers({
	selectedChatroom: function() {
		return Session.get('selectedChatroomId') == Template.currentData()._id
	},

	numPeople: function() {
		return Template.currentData().members.length
	},

	showNewNotification: function() {
		if (Session.get('windowHasFocus') && Session.get('selectedChatroomId') == this._id) {
			return false
		}

		if (ReactiveCookie.get('room_'+this._id+'_hideNotifications')) {
			return false;
		}

		var recent = Recentchats.findOne({room_id:Template.currentData()._id})
		if (recent) {
			var latest_open = ReactiveCookie.get('room_'+this._id+'_open')
			if (latest_open) {
				if (moment(new Date(recent.updated_at)).isAfter(moment(new Date(latest_open)))) {
					return true
				}
			} else {
				return true
			}
		}
		return false
	}
})



Template.chatroom_list.events({
	'click .openChatroomButton': function(event, template) {
		event.preventDefault();
		if (Session.get('selectedChatroomId') == template.data._id) {
			Session.set('selectedChatroomId', null)
		} else {
			Session.set('selectedChatroomId', template.data._id)
			var date = new Date()
			ReactiveCookie.set('room_'+template.data._id+'_open', moment(date).add(1, 's').toDate(), {days:15});
		}
	},
})
