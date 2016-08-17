Meteor.startup(function() {

	if (process.env.DOMINUS_WORKER == 'true') {

		console.log('--- dominus worker started ---');


		Meteor.defer(function() {
			if (process.env.DOMINUS_TEST == 'false') {

				Settings.upsert({}, {$set: {isPaused:false}});

				// temp, fix up incomeFromVassals
				Players.update({incomeFromVassals:0}, {$set: {incomeFromVassals:{}}}, {multi:true});
				let vset = {};
				_s.market.types_plus_gold.forEach(function(type) {
					vset['incomeFromVassals.'+type] = 0;
				});
				Players.update({incomeFromVassals:0}, {$set:vset}, {multi:true});

				// another temp fix
				Armies.update({moveDistance:null}, {$set: {moveDistance:0}}, {multi:true});



				Armies.find({x:null, y:null}).forEach(function(army) {
					var num = Armies.update(army._id, {$set:{x:army.castle_x, y:army.castle_y}});
					console.log(num+' armies fixed with null x,y');
				})


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

				castles.forEach(function(res) {
					_s.armies.types.forEach(function(type) {
						if (res[type] < 0) {
							console.log('castle '+res._id+' had '+res[type]+' '+type+'s');
							var set = {};
							set[type] = 0;
							Castles.update(res._id, {$set:set});
						}
					});
				});

				villages.forEach(function(res) {
					_s.armies.types.forEach(function(type) {
						if (res[type] < 0) {
							console.log('village '+res._id+' had '+res[type]+' '+type+'s');
							var set = {};
							set[type] = 0;
							Villages.update(res._id, {$set:set});
						}
					});
				});

				armies.forEach(function(res) {
					var numSoldiers = 0;
					_s.armies.types.forEach(function(type) {
						if (res[type] < 0) {
							console.log('army '+res._id+' had '+res[type]+' '+type+'s');
							var set = {};
							set[type] = 0;
							Armies.update(res._id, {$set:set});
						} else {
							numSoldiers += res[type];
						}
					});

					// if no soldiers delete army
					if (!numSoldiers) {
						dArmies.destroyArmy(res._id);
					}
				});
			}
		});


	} else {

		// not worker
		console.log('--- dominus started ---');
	}
});
