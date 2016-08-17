Template.admin_chatrooms.helpers({
	chatrooms: function() {
		return Rooms.find({}, {sort:{latestChatDate:-1}}).map(function(room) {
			room.numMembers = room.members.length
			return room
		})
	},

	room: function() {
		return Rooms.findOne(Template.instance().openRoomId.get())
	}
})


Template.admin_chatrooms.events({
	'click .openRoomButton': function(event, template) {
		event.preventDefault()
		var roomId = event.currentTarget.getAttribute('data-id')
		Template.instance().openRoomId.set(roomId)
	}
})


Template.admin_chatrooms.created = function() {
	var self = this
	self.openRoomId = new ReactiveVar(null)

	self.autorun(function() {
		var roomId = self.openRoomId.get()
		if (roomId) {
			Meteor.subscribe('adminRoomchats', roomId)
		}
	})
}

Template.admin_chatrooms.onCreated(function() {
  this.subscribe('admin_chatrooms');
})
