Meteor.startup(function() {

	if (process.env.DOMINUS_WORKER == 'true') {

		console.log('--- dominus worker started ---');


		Meteor.defer(async function() {
			if (process.env.DOMINUS_TEST == 'false') {

				await Settings.upsertAsync({}, {$set: {isPaused:false}});

				// temp, fix up incomeFromVassals
				await Players.updateAsync({incomeFromVassals:0}, {$set: {incomeFromVassals:{}}}, {multi:true});
				let vset = {};
				_s.market.types_plus_gold.forEach(function(type) {
					vset['incomeFromVassals.'+type] = 0;
				});
				await Players.updateAsync({incomeFromVassals:0}, {$set:vset}, {multi:true});

				// another temp fix
				await Armies.updateAsync({moveDistance:null}, {$set: {moveDistance:0}}, {multi:true});



				for (let army of await Armies.find({x:null, y:null}).fetchAsync()) {
					var num = await Armies.updateAsync(army._id, {$set:{x:army.castle_x, y:army.castle_y}});
					console.log(num+' armies fixed with null x,y');
				}


				//make sure there are no negative armies
				var find = [];
				_s.armies.types.forEach(function(type) {
					var or = {};
					or[type] = {$lt:0};
					find.push(or);
				});

				var castles = Castles.find({$or:find});
				var villages = Villages.find({$or:find});
				var armies = Armies.find({$or:find});

				for (let res of await castles.fetchAsync()) {
					for (let type of _s.armies.types) {
						if (res[type] < 0) {
							console.log('castle '+res._id+' had '+res[type]+' '+type+'s');
							var set = {};
							set[type] = 0;
							await Castles.updateAsync(res._id, {$set:set});
						}
					}
				}

				for (let res of await villages.fetchAsync()) {
					for (let type of _s.armies.types) {
						if (res[type] < 0) {
							console.log('village '+res._id+' had '+res[type]+' '+type+'s');
							var set = {};
							set[type] = 0;
							await Villages.updateAsync(res._id, {$set:set});
						}
					}
				}

				for (let res of await armies.fetchAsync()) {
					var numSoldiers = 0;
					for (let type of _s.armies.types) {
						if (res[type] < 0) {
							console.log('army '+res._id+' had '+res[type]+' '+type+'s');
							var set = {};
							set[type] = 0;
							await Armies.updateAsync(res._id, {$set:set});
						} else {
							numSoldiers += res[type];
						}
					}

					// if no soldiers delete army
					if (!numSoldiers) {
						await dArmies.destroyArmy(res._id);
					}
				}
			}
		});


	} else {

		// not worker
		console.log('--- dominus started ---');
	}
});
