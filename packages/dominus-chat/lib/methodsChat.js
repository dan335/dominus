Meteor.methods({
  addChatToRoom: function(gameId, room_id, text) {
    check(gameId, String);
    check(room_id, String);
    check(text, String);
    this.unblock();

    if (!this.userId) {
      return false;
    }

    let player = Players.findOne({gameId:gameId, userId:this.userId}, {fields: {_id:1}});
    if (!player) {
      return false;
    }

    var chatDate = new Date();

    text = text.toString().trim();

    // room must be in this game and the player must be a member
    // every player is in the everyone room, a job adds new players to its members
    var fields = {owner:1, admins:1};
    var find = {_id:room_id, gameId:gameId, $or: [{members:player._id}, {type:'everyone'}]};
    var room = Rooms.findOne(find, {fields:fields});
    if (!room) {
      throw new Meteor.Error('not-authorized', 'You are not in this chatroom.');
    }

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
    Recentchats.upsert({room_id:room_id, gameId:gameId}, {$set: {gameId:gameId, room_id:room_id, updated_at:chatDate}})
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
