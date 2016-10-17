Meteor.publish(null, function () {
	if (this.userId) {
		return Meteor.users.find({_id: this.userId}, {fields: {
			admin:1,
			created_at:1,
			hex_scale:1,	// TODO: move to player
			purchases:1,
			sp_show_coords:1,
			sp_show_minimap:1,
			emails:1,
			lastActive:1,
			presence:1,	// online status and ip
			possibleDupe:1,
			verifiedEmail:1,
			pro:1,
			proTokens:1,
			male:1,
			avatarFilename:1,
			banned:1,
			moderator:1
		}})
	} else {
		this.ready()
	}
});
