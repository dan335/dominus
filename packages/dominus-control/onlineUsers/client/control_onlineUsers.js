Template.control_onlineUsers.helpers({
  users: function() {
    return Meteor.users.find({"presence.status":'online'}, {sort: {"presence.updatedAt":-1}});
  },

  servers: function() {
    let servers =  _.groupBy(Meteor.users.find({"presence.status":'online'}).fetch(), function(user) {
      return user.presence.serverId;
    });

    let keys = _.keys(servers);

    let arr = [];
    keys.forEach(function(key) {

      arr.push({
        serverId: key,
        num: servers[key].length
      });
    });

    return arr;
  },

  numUsers: function() {
    return Meteor.users.find({"presence.status":'online'}).count();
  }
})

Template.control_onlineUsers.onCreated(function() {
  this.subscribe('control_onlineUsers');
})
