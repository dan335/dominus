Meteor.publish('myNormalChatrooms', function(gameId, playerId) {
	if(this.userId) {
		return Rooms.find({gameId:gameId, members:playerId, type:'normal'})
	} else {
		this.ready()
	}
});

var myNormalChatroomsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'myNormalChatrooms'
}
DDPRateLimiter.addRule(myNormalChatroomsSubRule, 5, 5000);



Meteor.publish('myKingChatrooms', function(gameId, playerId) {
	if(this.userId) {
		return Rooms.find({gameId:gameId, members:playerId, type:'king'})
	} else {
		this.ready();
	}
});

var myKingChatroomsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'myKingChatrooms'
}
DDPRateLimiter.addRule(myKingChatroomsSubRule, 5, 5000);




Meteor.publish('everyoneChatroom', function(gameId) {
	if(this.userId) {
		return Rooms.find({gameId:gameId, type:'everyone'})
	} else {
		this.ready()
	}
});

var everyoneChatroomSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'everyoneChatroom'
}
DDPRateLimiter.addRule(everyoneChatroomSubRule, 5, 5000);




Meteor.publish('roomchats', function(chatroom_id) {
	if(this.userId) {
		return Roomchats.find({room_id: chatroom_id}, {sort: {created_at: -1}, limit: 100})
	} else {
		this.ready()
	}
});

var roomchatsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'roomchats'
}
DDPRateLimiter.addRule(roomchatsSubRule, 5, 5000);



Meteor.publish('recentchats', function(idArray) {
	if(this.userId && idArray) {
		return Recentchats.find({room_id:{$in:idArray}});
	} else {
		this.ready()
	}
});

var recentchatsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'recentchats'
}
DDPRateLimiter.addRule(recentchatsSubRule, 5, 5000);




Meteor.publish('room_list', function(gameId, playerId) {
	if (gameId && playerId) {
		var sub = this
		var cur = Rooms.find({members:playerId}, {fields: {_id:1}})
		Mongo.Collection._publishCursor(cur, sub, 'room_list')
	}
	return sub.ready()
});

var room_listSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'room_list'
}
DDPRateLimiter.addRule(room_listSubRule, 5, 5000);
