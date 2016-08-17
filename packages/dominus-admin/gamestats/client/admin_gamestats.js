Template.admin_gamestats.helpers({
	gamestats: function() {
		return Gamestats.find({}, {sort: {created_at:-1}})
	},
})

Template.admin_gamestats.onCreated(function() {
  this.subscribe('admin_gamestats');
})
