Template.admin_usersonline.helpers({
	users: function() {
		return Meteor.users.find({"status.online":true}, {fields: {username:1, status:1}}, {disableOplog:true})
	},
})

Template.admin_usersonline.onCreated(function() {
  this.subscribe('admin_users_online');
})
