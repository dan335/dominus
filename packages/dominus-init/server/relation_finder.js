// update relationships for user and everyone in their king's branch
// allies - everyone above and below you in tree not including self - NON LONGER USED
// allies_below - everyone below not including self
// allies_above - everyone above not including self
// vassals - direct vassals
// king - your king or yourself if you are king
// is_king - are you king
// team - everyone under your king not including self


// TODO: make sure this is safe to run mltiple at once, use prototype!?
// job queue needs to be stopped while running this
// so that another job doesn't change someone's allies while it's running
const Future = Npm.require('fibers/future');

if (process.env.DOMINUS_WORKER == 'true') {

	Queues.updateAllKingsAllies.process(Meteor.bindEnvironment(function(job) {
		Meteor.call('pauseJobQueue');

		// wait a couple seconds for jobs to finish
		let future = new Future();
		Meteor.setTimeout(function() {
			future.return(true);
		}, 1000*5);
		future.wait();

		// update allies for game
		Players.find({gameId:job.data.gameId, is_king:true}).forEach(function(player) {
			var rf = new relation_finder(player._id);
			rf.start();
		});

		dManager.checkForDominus(job.data.gameId);

		Queues.add('cleanupAllKingChatrooms', {gameId:job.data.gameId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, job.data.gameId);

		Meteor.call('resumeJobQueue');
		return Promise.resolve();
	}));
}




relation_finder = function(playerId) {
	check(playerId, String);

	this.playerId = playerId;
	this.player = Players.findOne(playerId, {fields: {lord:1, gameId:1}});

	if (!this.player) {
		console.error("Can't find user in relation_finder");
		return false;
	}
	this.num_branches = 1;
	this.team = [];
	//this.update_cache = [];
	this.gameId = this.player.gameId;

	this.bulk = Players.rawCollection().initializeOrderedBulkOp();
}


relation_finder.prototype.start = function() {
	var self = this;
	self.find_top(self.player);
};


relation_finder.prototype.find_top = function(player) {

	var self = this;
	var lord = Players.findOne(player.lord, {fields: {lord:1}});
	if (lord) {
		if (player._id == lord._id) {
			console.error('player: '+player.username);
			console.error('lord: '+lord.username);
			console.error("infinite loop");
			return false;
		}
		self.find_top(lord);
	} else {
		self.traverse_down(player);
	}
};

// find all the branch ends
// add to team
// keep track of num_branches so that we know when we're totally done
relation_finder.prototype.traverse_down = function(player) {
	var self = this;

	// if this is not me add to team
	self.team.push(player._id);

	var vassals = Players.find({lord:player._id}, {fields: {lord:1}});

	// get direct vassal ids
	vassalIds = _.pluck(vassals.fetch(), '_id');

	// set vassals and defaults
	let set = {is_king:false, vassals:vassalIds, allies_below:[], allies_above:[], team:[]};
	self.bulk.find({_id:player._id}).updateOne({$set:set});


	if (vassals.count() === 0) {
		// reached end
		self.num_branches--;
		self.traverse_up(player, []);
	} else {

		self.num_branches += vassals.count() - 1;
		vassals.forEach(function(vassal) {
			self.traverse_down(vassal);
		});
	}
};


// traverse through everyone on team up to the king
relation_finder.prototype.traverse_up = function(player, allies_below_array) {

	var self = this;

	// add self to allies_above to everyone in allies_below_array
	// add allies_below_array to allies_below
	allies_below_array.forEach(function(id) {
		self.bulk.find({_id:id}).updateOne({$addToSet: {allies_above:player._id}});
		self.bulk.find({_id:player._id}).updateOne({$addToSet: {allies_below:id}});
	})

	// traverse up
	var lord = Players.findOne(player.lord, {fields:{lord:1}});
	if (lord) {
		// add self
		allies_below_array.push(player._id);

		// process lord
		self.traverse_up(lord, allies_below_array);
	} else {
		self.reached_top(player);
	}
};


// at king
relation_finder.prototype.reached_top = function(player) {
	var self = this;

	if (self.num_branches === 0) {

		self.bulk.find({_id: {$in: self.team}}).update({$set: {king:player._id, team:self.team}});

		self.bulk.find({_id:player._id}).updateOne({$set: {is_king:true}});

		self.bulk.execute({}, function(error, result) {
	    if (error) {
	      console.error(error);
	    }
	  });

		Queues.add('updateVassalAllyCountMultiple', {playerIds:self.team}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, false);
	}
};
