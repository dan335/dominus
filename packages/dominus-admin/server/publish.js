var admin_publish = function (name, handler) {
	Meteor.publish(name, function() {
		if(this.userId && get_user_property("admin", this.userId)) {
			return handler();
		} else {
			this.ready();
		}
	});
};

admin_publish('admin_charges', function() {
	return Charges.find();
});

admin_publish('admin_gamestats', function() {
	return Gamestats.find();
});

Meteor.publish('admin_users_online', function() {
	return Meteor.users.find({"status.online":true}, {fields: {username:1, status:1}});
});

admin_publish('admin_chatrooms', function() {
	return Rooms.find({}, {}, {disableOplog:true});
});

Meteor.publish('adminRoomchats', function(chatroom_id) {
	if(this.userId && get_user_property("admin", this.userId)) {
		return Roomchats.find({room_id: chatroom_id}, {sort: {created_at: -1}, limit: 500}, {disableOplog:true});
	} else {
		return this.ready();
	}
});

Meteor.publish('adminChatUsers', function(userIds) {
	var self = this;

	if (this.userId && get_user_property("admin", this.userId)) {
		var options = {fields:{username:1, x:1, y:1, castle_id:1}};
    var query = Meteor.users.find({_id: {$in:userIds}}, options, {disableOplog:true});
    Mongo.Collection._publishCursor(query, self, 'adminchatusers');
	}
	return self.ready();
})

admin_publish('adminReports', function() {
	return Reports.find({}, {sort:{createdAt:-1}, limit:200});
});
