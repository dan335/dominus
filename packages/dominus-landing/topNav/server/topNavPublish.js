Meteor.publish(null, function() {
	var cur = Players.find({userId:this.userId, gameIsClosed:false}, {fields: {gameId:1, gameName:1}})
	Mongo.Collection._publishCursor(cur, this, 'mygames');
	return this.ready();
});
