Template.chatroom_open.helpers({
	hasReports: function() {
		let playerId = Session.get('playerId');

		// owner and admins can always chat
		if (playerId == this.owner || _.contains(this.admins, playerId)) {
			return false;
		}

		var num = Reports.find().count();
		if (num && num > 0) {
			return true;
		}
	},

	reportTimeLeft: function() {
		var fields = {createdAt:1};
		var sort = {createdAt:1};
		var oldest = Reports.findOne({}, {sort:sort, fields:fields});
		var numReports = Reports.find().count();
		if (oldest) {
			var reportDate = moment(oldest.createdAt);
			var pastTime = moment() - reportDate;
			var length = reportDuration(numReports);
			var timeLeft = length - pastTime;
			return moment.duration(timeLeft).humanize();
		}
	},

	chatroomChatsReady: function() {
		return Template.instance().chatroomChatsReady.get()
	},

	numPeople: function() {
		return Template.currentData().members.length
	},

	showLeaveConfirm: function() {
		return Template.instance().showLeaveConfirm.get() ? 'block' : 'none'
	},

	showInviteBox: function() {
		return Template.instance().showInviteBox.get() ? 'block' : 'none'
	},

	showRenameBox: function() {
		return Template.instance().showRenameBox.get() ? 'block' : 'none'
	},

	showChatBox: function() {
		return Template.instance().showChatBox.get() ? 'block' : 'none'
	},

	roomChats: function() {
		var data = Template.currentData();
		var room_id = Session.get('selectedChatroomId')
		var chats = Roomchats.find({room_id:room_id}, {sort: {created_at: -1}})
		return chats.map(function(chat) {
			var player = _.find(data.memberData, function(member) {
				return chat.playerId == member._id;
			})
			if (player) {
				chat.username = player.username
				chat.castle_id = player.castle_id
				chat.x = player.x
				chat.y = player.y
			}
			return chat
		})
	},

	roomOwner: function() {
		var data = Template.currentData();
		if (data.type != 'everyone') {
			if (data.owner) {
				return _.find(data.memberData, function(member) {
					return data.owner == member._id;
				})
			}
		}
	},

	roomAdmins: function() {
		var data = Template.currentData();
		if (data.type == 'normal') {
			if (data.admins.length > 0) {
				return _.filter(data.memberData, function(member) {
					return _.contains(data.admins, member._id);
				})
			}
		}
	},

	roomMembers: function() {
		var data = Template.currentData();
		var rejectIds = _.union(data.admins, data.owner);
		return _.reject(data.memberData, function(member) {
			return _.contains(rejectIds, member._id);
		})
	},

	showMembers: function() {
		return Template.instance().showMembers.get()
	},

	// admins and owner can invite people
	showInviteButton: function() {
		var room_type = Template.currentData().type
		if (room_type == 'king' || room_type == 'everyone') {
			return false
		}

		let playerId = Session.get('playerId');

		// if owner
		if (playerId == Template.currentData().owner) {
			return true
		}

		// if admin
		if (_.contains(Template.currentData().admins, playerId)) {
			return true
		}

		return false
	},

	// owner can rename room
	showRenameButton: function() {
		var room_type = Template.currentData().type
		if (room_type == 'king' || room_type == 'everyone') {
			return false
		}

		let playerId = Session.get('playerId');

		// if owner
		if (playerId == Template.currentData().owner) {
			return true
		}

		return false
	},

	showLeaveButton: function() {
		return Template.currentData().type == 'normal'
	},

	/*Should new messages in chat room create a notification in top bar
	ZackEarthling*/
	roomNotificationsOn: function(){
		return !ReactiveCookie.get('room_'+this._id+'_hideNotifications');
	},

	showNewNotification: function() {
		if (Session.get('windowHasFocus') && Session.get('selectedChatroomId') == this._id) {
			var date = new Date()
			ReactiveCookie.set('room_'+this._id+'_open', moment(date).add(2, 's').toDate(), {days:15})
			return false
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


Template.chatroom_open.events({
	'click .leaveChatroomButton': function(event, template) {
		event.preventDefault();
		if (template.showLeaveConfirm.get()) {
			template.showLeaveConfirm.set(false)
			template.showChatBox.set(true)
		} else {
			template.showChatBox.set(false)
			template.showRenameBox.set(false)
			template.showInviteBox.set(false)
			template.showLeaveConfirm.set(true)
		}
	},

	'click .chatroomLeaveNoButton': function(event, template) {
		event.preventDefault();
		template.showLeaveConfirm.set(false)
		template.showChatBox.set(true)
	},

	'click .chatroomLeaveYesButton': function(event, template) {
		event.preventDefault();
		Meteor.apply('leaveChatroom', [Session.get('gameId'), template.data._id])
	},

	'click .showMembersButton': function(event, template) {
		event.preventDefault();
		template.showMembers.set(!template.showMembers.get())
	},

	'click .buttonTurnRoomNotificationsOn': function(event, template){
		event.preventDefault();
		ReactiveCookie.clear('room_'+this._id+'_hideNotifications');
	},

	'click .buttonTurnRoomNotificationsOff': function(event, template){
		event.preventDefault();
		ReactiveCookie.set('room_'+this._id+'_hideNotifications', true, {days:15});
	},

	'click .renameButton': function(event, template) {
		event.preventDefault();
		if (template.showRenameBox.get()) {
			template.showRenameBox.set(false)
			template.showChatBox.set(true)
		} else {
			template.showChatBox.set(false)
			template.showLeaveConfirm.set(false)
			template.showInviteBox.set(false)
			template.showRenameBox.set(true)
		}
	},

	'click .renameCancelButton': function(event, template) {
		event.preventDefault();
		template.showRenameBox.set(false)
		template.showChatBox.set(true)
	},

	'click .renameSaveButton': function(event, template) {
		event.preventDefault();
		var name = template.find('.renameInput')
		var errorAlert = template.find('.renameErrorAlert')
		var button = event.currentTarget;
		var button_html = $(button).html()

		$(errorAlert).hide()

		$(button).attr('disabled', true)
		$(button).html('Please Wait')

		Meteor.apply('renameChatroom', [Session.get('gameId'), template.data._id, $(name).val()], {}, function(error, result) {
			$(button).attr('disabled', false)
			$(button).html(button_html)

			if (error) {
				$(errorAlert).show()
				$(errorAlert).html(error.error)
			} else {
				template.showRenameBox.set(false)
				template.showChatBox.set(true)
			}
		})
	},

	'click .inviteButton': function(event, template) {
		event.preventDefault();
		if (template.showInviteBox.get()) {
			template.showInviteBox.set(false)
			template.showChatBox.set(true)
		} else {
			template.showChatBox.set(false)
			template.showLeaveConfirm.set(false)
			template.showRenameBox.set(false)
			template.showInviteBox.set(true)
		}
	},

	'click .inviteCancelButton': function(event, template) {
		event.preventDefault();
		template.showInviteBox.set(false)
		template.showChatBox.set(true)
	},

	'click .inviteSaveButton': function(event, template) {
		event.preventDefault();
		var name = template.find('.inviteInput')
		var errorAlert = template.find('.inviteErrorAlert')
		var button = event.currentTarget
		var button_html = $(button).html()

		$(errorAlert).hide()

		$(button).attr('disabled', true)
		$(button).html('Please Wait')

		Meteor.apply('inviteToChatroom', [Session.get('gameId'), template.data._id, $(name).val()], {}, function(error, result) {
			$(button).attr('disabled', false)
			$(button).html(button_html)

			if (error) {
				$(errorAlert).show()
				$(errorAlert).html(error.error)
			} else {
				$(name).val('')
				template.showInviteBox.set(false)
				template.showChatBox.set(true)
			}
		})
	},

	'click .usernameLink': function(event, template) {
		event.preventDefault()
		event.stopPropagation();
		dInit.select('castle', this.x, this.y, this.castle_id);
		dHexmap.centerOnHex(this.x, this.y);
	},

	'click .hex-link': function(event, template) {
		event.preventDefault()
		event.stopPropagation()
		var hex = {
			x: parseInt(event.currentTarget.getAttribute('data-x')),
			y: parseInt(event.currentTarget.getAttribute('data-y'))
		}

		dInit.select('hex', hex.x, hex.y, null);
		dHexmap.centerOnHex(hex.x, hex.y);
	},

	'click .sendChatButton': function(event, template) {
		event.preventDefault()
		event.stopPropagation()

		var input = template.find('.chatInput');
		var alert = template.find('#chatSendAlert');
		var text = input.value;
		$(input).val('');

		$(alert).hide();

		Meteor.apply('addChatToRoom', [Session.get('gameId'), template.data._id, text], {}, function(error, result) {
			if (error) {
				$(alert).show();
				$(alert).html(error.reason);
				$(input).val(text);
			} else {
				ReactiveCookie.set('room_'+this._id+'_open', moment(new Date()).add(5, 's').toDate(), {days:15});
			}
		});
	},

	// same as click function
	'keyup .chatInput': function(event, template) {
		if (event.keyCode === 13) {
			event.preventDefault()
			event.stopPropagation()

			var input = template.find('.chatInput');
			var alert = template.find('#chatSendAlert');
			var text = input.value;
			$(input).val('');

			$(alert).hide();

			Meteor.apply('addChatToRoom', [Session.get('gameId'), template.data._id, text], {}, function(error, result) {
				if (error) {
					$(alert).show();
					$(alert).html(error.reason);
					$(input).val(text);
				} else {
					ReactiveCookie.set('room_'+this._id+'_open', moment(new Date()).add(5, 's').toDate(), {days:15});
				}
			});
		}
	}
})



Template.chatroom_open.created = function() {
	var self = this

	this.showLeaveConfirm = new ReactiveVar(false)
	this.showRenameBox = new ReactiveVar(false)
	this.showInviteBox = new ReactiveVar(false)
	this.showMembers = new ReactiveVar(false)
	this.showChatBox = new ReactiveVar(true)

	this.autorun(function() {
		var selected_id = Session.get('selectedChatroomId')
		if (selected_id) {
			self.subscribe('roomchats', selected_id)
		}
	})
}
