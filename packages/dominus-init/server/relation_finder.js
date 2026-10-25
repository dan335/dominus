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

if (process.env.DOMINUS_WORKER == 'true') {
	Queues.updateAllKingsAllies.process(async function(job) {
		await dInit.updateAllKingsAlliesJob(job.data.gameId);
	});
}


// Rebuild relationships for one game, or for every running game when gameId
// is not given (the midnight job). The queues are paused once for the whole
// run and always resumed, even when a rebuild throws. Each game is rebuilt on
// its own, so one bad game can't stop the others.
dInit.updateAllKingsAlliesWaitMs = 1000*5;

// gives jobs that are running when the queues pause a few seconds to finish
dInit.waitForRunningJobs = function() {
	return new Promise(function(resolve) {
		setTimeout(resolve, dInit.updateAllKingsAlliesWaitMs);
	});
};

dInit.updateAllKingsAlliesJob = async function(gameId) {
	let gameIds;
	if (gameId) {
		gameIds = [gameId];
	} else {
		gameIds = (await Games.find({hasStarted:true, hasEnded:false}, {fields: {_id:1}}).fetchAsync()).map(function(game) {
			return game._id;
		});
	}

	if (!gameIds.length) {
		return;
	}

	await Queues.pauseAllAsync(false);

	try {
		// wait a couple seconds for jobs to finish
		await dInit.waitForRunningJobs();

		for (const id of gameIds) {
			try {
				// update allies for game
				await dInit.rebuildRelationships(id);

				dManager.checkForDominus(id);

				await Queues.addAsyncOrLog('cleanupAllKingChatrooms', {gameId:id}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, id);
			} catch (error) {
				console.error('updateAllKingsAllies failed for game ' + id, error);
			}
		}
	} finally {
		await Queues.resumeAllAsync();
	}
};




// rebuild all king relationships for a game
// used by updateAllKingsAllies job and tests
dInit.rebuildRelationships = async function(gameId) {
	for (const player of await Players.find({gameId:gameId, is_king:true}).fetchAsync()) {
		var rf = new relation_finder(player._id);
		await rf.start();
	}
};


relation_finder = function(playerId) {
	check(playerId, String);

	this.playerId = playerId;
	this.num_branches = 1;
	this.team = [];
	//this.update_cache = [];

	this.bulk = Players.rawCollection().initializeOrderedBulkOp();
}


// the player is read here: a constructor can't wait for the database
relation_finder.prototype.start = async function() {
	var self = this;
	self.player = await Players.findOneAsync(self.playerId, {fields: {lord:1, gameId:1}});

	if (!self.player) {
		console.error("Can't find user in relation_finder");
		return false;
	}
	self.gameId = self.player.gameId;

	await self.find_top(self.player);
};


relation_finder.prototype.find_top = async function(player) {

	var self = this;
	var lord = await Players.findOneAsync(player.lord, {fields: {lord:1}});
	if (lord) {
		if (player._id == lord._id) {
			console.error('player: '+player.username);
			console.error('lord: '+lord.username);
			console.error("infinite loop");
			return false;
		}
		await self.find_top(lord);
	} else {
		await self.traverse_down(player);
	}
};

// find all the branch ends
// add to team
// keep track of num_branches so that we know when we're totally done
relation_finder.prototype.traverse_down = async function(player) {
	var self = this;

	// if this is not me add to team
	self.team.push(player._id);

	var vassals = await Players.find({lord:player._id}, {fields: {lord:1}}).fetchAsync();

	// get direct vassal ids
	var vassalIds = _.pluck(vassals, '_id');

	// set vassals and defaults
	let set = {is_king:false, vassals:vassalIds, allies_below:[], allies_above:[], team:[]};
	self.bulk.find({_id:player._id}).updateOne({$set:set});


	if (vassals.length === 0) {
		// reached end
		self.num_branches--;
		await self.traverse_up(player, []);
	} else {

		self.num_branches += vassals.length - 1;
		for (const vassal of vassals) {
			await self.traverse_down(vassal);
		}
	}
};


// traverse through everyone on team up to the king
relation_finder.prototype.traverse_up = async function(player, allies_below_array) {

	var self = this;

	// add self to allies_above to everyone in allies_below_array
	// add allies_below_array to allies_below
	allies_below_array.forEach(function(id) {
		self.bulk.find({_id:id}).updateOne({$addToSet: {allies_above:player._id}});
		self.bulk.find({_id:player._id}).updateOne({$addToSet: {allies_below:id}});
	})

	// traverse up
	var lord = await Players.findOneAsync(player.lord, {fields:{lord:1}});
	if (lord) {
		// add self
		allies_below_array.push(player._id);

		// process lord
		await self.traverse_up(lord, allies_below_array);
	} else {
		await self.reached_top(player);
	}
};


// at king
relation_finder.prototype.reached_top = async function(player) {
	var self = this;

	if (self.num_branches === 0) {

		self.bulk.find({_id: {$in: self.team}}).update({$set: {king:player._id, team:self.team}});

		self.bulk.find({_id:player._id}).updateOne({$set: {is_king:true}});

		try {
			await self.bulk.execute();
		} catch (error) {
			console.error(error);
		}

		await Queues.addAsyncOrLog('updateVassalAllyCountMultiple', {playerIds:self.team}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, false);
	}
};
