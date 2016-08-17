Meteor.methods({
  addChatToRoom: function(gameId, room_id, text) {
    this.unblock();
    let player = Players.findOne({gameId:gameId, userId:this.userId}, {fields: {_id:1}});
    if (!player) {
      return false;
    }

    var chatDate = new Date();

    text = text.toString().trim();

    var fields = {owner:1, admins:1};
    var room = Rooms.findOne(room_id, {fields:fields});

    // don't check for reports if person is owner or admin of room
    // owner and admins can always chat
    if (player._id != room.owner && !_.contains(room.admins, player._id)) {
      // can't chat if you have reports
      if (Reports.find({playerId:player._id, active:true}).count()) {
        throw new Meteor.Error('reported', 'Cannot chat while reported.');
      }
    }

    if (text.length == 0) {
      throw new Meteor.Error('validation', 'Text too short.');
    }

    if (text.length > 400) {
      throw new Meteor.Error('validation', 'Text too long.');
    }

    Roomchats.insert({
      room_id: room_id,
      created_at: chatDate,
      user_id: this.userId,
      playerId: player._id,
      text: text,
      gameId:gameId
    })

    Rooms.update(room_id, {$set:{latestChatDate:chatDate}});
    Recentchats.upsert({room_id:room_id}, {$set: {gameId:gameId, room_id:room_id, updated_at:chatDate}})
  }
});

if (Meteor.isServer) {
  var addChatToRoomRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'addChatToRoom'
  }
  DDPRateLimiter.addRule(addChatToRoomRule, 6, 5000);
}
