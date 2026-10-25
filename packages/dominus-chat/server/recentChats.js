// if a room is deleted clean up recent chats
Meteor.startup(function() {
	if (process.env.DOMINUS_WORKER == 'true') {

		Rooms.find({}, {fields: {_id:1}}).observeAsync({
			removed: function(room) {
				Recentchats.removeAsync({room_id:room._id}).catch(function(error) {
					console.error('could not remove the recent chats of room', room._id, error);
				});
			}
		}).catch(function(error) {
			console.error('could not watch rooms to clean up recent chats', error);
		});
		
	}
})
