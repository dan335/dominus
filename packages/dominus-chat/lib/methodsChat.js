// addChatToRoom runs on the client too, so the chat shows at once. It stays a
// plain function: the simulation is sync and the server's part is async (see
// "Async conversion" in CLAUDE.md).

// room must be in this game and the player must be a member
// every player is in the everyone room, a job adds new players to its members
var chatRoomFind = function(gameId, room_id, player) {
  return {_id:room_id, gameId:gameId, $or: [{members:player._id}, {type:'everyone'}]};
};
var chatRoomFields = {owner:1, admins:1};

// Throws if the player isn't in the room. Returns whether reports can stop
// them chatting in it: don't check for reports if person is owner or admin of
// room, owner and admins can always chat
var checkRoom = function(player, room) {
  if (!room) {
    throw new Meteor.Error('not-authorized', 'You are not in this chatroom.');
  }
  return player._id != room.owner && !_.contains(room.admins, player._id);
};

var checkChat = function(numReports, text) {
  // can't chat if you have reports
  if (numReports) {
    throw new Meteor.Error('reported', 'Cannot chat while reported.');
  }

  if (text.length == 0) {
    throw new Meteor.Error('validation', 'Text too short.');
  }

  if (text.length > 400) {
    throw new Meteor.Error('validation', 'Text too long.');
  }
};

var newRoomchat = function(gameId, room_id, userId, player, text, chatDate) {
  return {
    room_id: room_id,
    created_at: chatDate,
    user_id: userId,
    playerId: player._id,
    text: text,
    gameId:gameId
  };
};

Meteor.methods({
  addChatToRoom: function(gameId, room_id, text) {
    check(gameId, String);
    check(room_id, String);
    check(text, String);
    this.unblock();

    if (!this.userId) {
      return false;
    }

    var userId = this.userId;
    var playerFind = {gameId:gameId, userId:userId};
    var playerFields = {fields: {_id:1}};
    var reportsFind = function(player) { return {playerId:player._id, active:true}; };

    if (this.isSimulation) {
      let player = Players.findOne(playerFind, playerFields);
      if (!player) {
        return false;
      }
      var chatDate = dClock.now();
      text = text.toString().trim();
      var room = Rooms.findOne(chatRoomFind(gameId, room_id, player), {fields:chatRoomFields});
      var numReports = checkRoom(player, room) ? Reports.find(reportsFind(player)).count() : 0;
      checkChat(numReports, text);
      Roomchats.insert(newRoomchat(gameId, room_id, userId, player, text, chatDate));
      Rooms.update(room_id, {$set:{latestChatDate:chatDate}});
      Recentchats.upsert({room_id:room_id, gameId:gameId}, {$set: {gameId:gameId, room_id:room_id, updated_at:chatDate}});
      return;
    }

    return (async () => {
      let player = await Players.findOneAsync(playerFind, playerFields);
      if (!player) {
        return false;
      }
      var chatDate = dClock.now();
      text = text.toString().trim();
      var room = await Rooms.findOneAsync(chatRoomFind(gameId, room_id, player), {fields:chatRoomFields});
      var numReports = checkRoom(player, room) ? await Reports.find(reportsFind(player)).countAsync() : 0;
      checkChat(numReports, text);
      await Roomchats.insertAsync(newRoomchat(gameId, room_id, userId, player, text, chatDate));
      await Rooms.updateAsync(room_id, {$set:{latestChatDate:chatDate}});
      await Recentchats.upsertAsync({room_id:room_id, gameId:gameId}, {$set: {gameId:gameId, room_id:room_id, updated_at:chatDate}});
    })();
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
