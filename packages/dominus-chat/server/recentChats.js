// if a room is deleted clean up recent chats
Meteor.startup(function() {
	if (process.env.DOMINUS_WORKER == 'true') {

		Rooms.find({}, {fields: {_id:1}}).observe({
			remove: function(room) {
				Recentchats.remove({room_id:room._id})
			}
		});
		
	}
})
