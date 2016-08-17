Meteor.startup(function() {
	if (process.env.DOMINUS_WORKER == 'true') {
    SyncedCron.config({
      // Log job run details to console
      log: false,

      // Use a custom logger function (defaults to Meteor's logging package)
      logger: function(opts) {
				if (_.contains(['warn', 'error', 'debug'], opts.level)) {
					console.log(opts.message);
				}
			},

      // Name of collection to use for synchronisation and logging
      collectionName: 'cronHistory',

      // Default to using localTime
      utc: true,

      /*
        TTL in seconds for history records in collection to expire
        NOTE: Unset to remove expiry but ensure you remove the index from
        mongo by hand

        ALSO: SyncedCron can't use the `_ensureIndex` command to modify
        the TTL index. The best way to modify the default value of
        `collectionTTL` is to remove the index by hand (in the mongo shell
        run `db.cronHistory.dropIndex({startedAt: 1})`) and re-run your
        project. SyncedCron will recreate the index with the updated TTL.
      */
      collectionTTL: 172800
    });

    SyncedCron.start();


		let armyFields = {gameId:1};
		_s.armies.types.forEach(function(type) {
			armyFields[type] = 1;
		});

		SyncedCron.add({
      name: 'army path speed jobs',
      schedule: function(parser) {return parser.cron('*/2 * * * * *', true);},
      job: function() {
				Armypaths.find({countryIds:null}, {fields: {gameId:1, countryIds:1, x:1, y:1, index:1, armyId:1}}).forEach(function(path) {
					Queues.add('findCountriesInPath', {path:path}, {attempts:10, backoff:{type:'fixed', delay:3000}, delay:0, timeout:1000*60*3}, path._id);
				});

				Armypaths.find({countryIds:{$ne:null}, hexes:null}).forEach(function(path) {
					Queues.add('pathToHex', {path:path}, {delay:0, timeout:1000*60*3}, path._id);
				});

				Armies.find({speed:null}, {fields:armyFields}).forEach(function(army) {
					Queues.add('updateMoveSpeed', {army:army}, {delay:0, timeout:1000*60}, false);
				});

				Armypaths.find({time:null, speed:{$ne:null}, distance:{$ne:null}}, {fields: {armyId:1, speed:1, distance:1}}).forEach(function(path) {
					Queues.add('updatePathTime', {path:path}, {delay:0, timeout:1000*60}, false);
				});

				Armypaths.find({dirtyMoveTotals:true, distance:{$ne:null}, time:{$ne:null}}, {fields: {armyId:1}}).forEach(function(path) {
					Queues.add('updateArmyMoveTotals', {armyId:path.armyId}, {delay:0, timeout:1000*60}, false);
				});
      }
    });

    SyncedCron.add({
      name: '5 sec job',
      schedule: function(parser) {return parser.cron('*/5 * * * * *', true);},
      job: function() {
        Queues.add('moveArmiesJob', {}, {delay:0, timeout:1000*60}, false);

				Queues.add('collectCastleIncome', {}, {delay:0, timeout:1000*60*5}, false);
  			Queues.add('collectVillageIncome', {}, {delay:0, timeout:1000*60*5}, false);
  			Queues.add('collectCapitalIncome', {}, {delay:0, timeout:1000*60*5}, false);
      }
    });

    SyncedCron.add({
      name: 'battle job',
      schedule: function(parser) {return parser.cron('*/20 * * * * *', true);},
      job: function() {
        Games.find({hasStarted:true, hasEnded:false}, {fields: {_id:1}}).forEach(function(game) {
          let interval = _gs.battles(game._id, 'battleInterval');
          let cutoff = moment().subtract(interval, 'ms').toDate();
          Battles2.find({gameId:game._id, isOver:false, updatedAt: {$lt:cutoff}}, {fields: {gameId:1, x:1, y:1}}).forEach(function(battle) {
            Queues.add('runBattle', {gameId:battle.gameId, x:battle.x, y:battle.y}, {delay:0, timeout:1000*60*5}, battle.gameId+'_'+battle.x+'_'+battle.y);
          })
        });
      }
    });

    SyncedCron.add({
      name: '1 min job',
      schedule: function(parser) {return parser.cron('* * * * *');},
      job: function() {
        Queues.add('checkForGameClose', {}, {delay:0, timeout:1000*60*5}, false);
        Queues.add('checkForGameEnd', {}, {delay:0, timeout:1000*60*5}, false);
        Queues.add('checkForGameStart', {}, {delay:0, timeout:1000*60*5}, false);
				Games.find({hasStarted:true, hasEnded:false}, {fields: {_id:1}}).forEach(function(game) {
	        Queues.add('villageConstructionJob', {gameId:game._id}, {delay:0, timeout:1000*60*5}, false);
	      });
      }
    });

    SyncedCron.add({
      name: '5 min job',
      schedule: function(parser) {return parser.cron('*/5 * * * *');},
      job: function() {
        Queues.add('expirePastMoves', {}, {delay:0, timeout:1000*60}, false);
      }
    });

    SyncedCron.add({
      name: '10 min job',
      schedule: function(parser) {return parser.cron('*/10 * * * *');},
      job: function() {
        Games.find({hasStarted:true, hasEnded:false}, {fields: {_id:1}}).forEach(function(game) {
  				Queues.add('gamestats_job', {gameId:game._id}, {delay:0, timeout:1000*60}, game._id);
  				Queues.add('updateIncomeRank', {gameId:game._id}, {delay:0, timeout:1000*60}, game._id);
  				Queues.add('updateVassalRank', {gameId:game._id}, {delay:0, timeout:1000*60}, game._id);
  			});
      }
    });

    SyncedCron.add({
      name: '30 min job',
      schedule: function(parser) {return parser.cron('*/30 * * * *');},
      job: function() {
        Games.find({hasStarted:true, hasEnded:false}, {fields: {_id:1}}).forEach(function(game) {
          Queues.add('record_market_history', {gameId:game._id, quantity:0}, {delay:0, timeout:1000*60*5}, false);
      		Queues.add('spendTaxes', {gameId:game._id}, {delay:0, timeout:1000*60*5}, game._id);
      		Queues.add('generateTree', {gameId:game._id}, {delay:0, timeout:1000*60*5}, game._id);
      		Queues.add('updateIncomeStats', {gameId:game._id}, {delay:0, timeout:1000*60*5}, game._id);
					Queues.add('removeStuckBattles', {}, {delay:0, timeout:1000*60}, false);
  			});
      }
    });

    SyncedCron.add({
      name: 'midnight job',
      schedule: function(parser) {return parser.cron('00 00 * * *');},
      job: function() {
				Queues.add('resetQueueStats', {}, {delay:0, timeout:1000*60*5}, false);
        Games.find({hasStarted:true, hasEnded:false}, {fields: {_id:1}}).forEach(function(game) {
      		Queues.add('dailystatsNumVassalsEveryone', {gameId:game._id}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60}, game._id);
      		Queues.add('updateAllKingsAllies', {gameId:game._id}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60}, game._id);
      	});
      }
    });
  }
});
