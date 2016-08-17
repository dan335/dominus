Meteor.methods({
	show_castle: function(gameId) {
		check(gameId, String);
		Players.update({userId:this.userId, gameId:gameId}, {$set: {lp_show_castle: true}})
	},

	hide_castle: function(gameId) {
		check(gameId, String);
		Players.update({userId:this.userId, gameId:gameId}, {$set: {lp_show_castle: false}})
	},

	show_villages: function(gameId) {
		check(gameId, String);
		Players.update({userId:this.userId, gameId:gameId}, {$set: {lp_show_villages: true}})
	},

	hide_villages: function(gameId) {
		check(gameId, String);
		Players.update({userId:this.userId, gameId:gameId}, {$set: {lp_show_villages: false}})
	},

	show_armies: function(gameId) {
		check(gameId, String);
		Players.update({userId:this.userId, gameId:gameId}, {$set: {lp_show_armies: true}})
	},

	hide_armies: function(gameId) {
		check(gameId, String);
		Players.update({userId:this.userId, gameId:gameId}, {$set: {lp_show_armies: false}})
	},

	show_lords: function(gameId) {
		check(gameId, String);
		Players.update({userId:this.userId, gameId:gameId}, {$set: {lp_show_lords: true}})
	},

	hide_lords: function(gameId) {
		check(gameId, String);
		Players.update({userId:this.userId, gameId:gameId}, {$set: {lp_show_lords: false}})
	},

	show_allies: function(gameId) {
		check(gameId, String);
		Players.update({userId:this.userId, gameId:gameId}, {$set: {lp_show_allies: true}})
	},

	hide_allies: function(gameId) {
		check(gameId, String);
		Players.update({userId:this.userId, gameId:gameId}, {$set: {lp_show_allies: false}})
	},
})
