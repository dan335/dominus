Template.admin_chatroom.helpers({
    chats: function() {
      var self = this;
      var chats = Roomchats.find({}, {sort: {created_at: -1}});
      return chats.map(function(chat) {
        var user = AdminChatUsers.findOne({_id:chat.user_id});
        if (user) {
          chat.username = user.username;
          chat.castle_id = user.castle_id;
          chat.x = user.x;
          chat.y = user.y;
        }
        return chat;
      })
    }
});


Template.admin_chatroom.onCreated(function() {
  var self = this;

  this.autorun(function() {
    var userIds = [];
    var chats = Roomchats.find({}, {fields:{user_id:1}});
    chats.forEach(function(chat) {
      userIds.push(chat.user_id);
    });
    if (userIds.length) {
      Meteor.subscribe('adminChatUsers', userIds);
    }
  });
});
