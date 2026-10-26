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
      job: async function() {
				await Armypaths.find({countryIds:null}, {fields: {gameId:1, countryIds:1, x:1, y:1, index:1, armyId:1}}).forEachAsync(async function(path) {
					await Queues.addAsyncOrLog('findCountriesInPath', {path:path}, {attempts:10, backoff:{type:'fixed', delay:3000}, delay:0, timeout:1000*60*3}, path._id);
				});

				await Armypaths.find({countryIds:{$ne:null}, hexes:null}).forEachAsync(async function(path) {
					await Queues.addAsyncOrLog('pathToHex', {path:path}, {delay:0, timeout:1000*60*3}, path._id);
				});

				await Armies.find({speed:null}, {fields:armyFields}).forEachAsync(async function(army) {
					await Queues.addAsyncOrLog('updateMoveSpeed', {army:army}, {delay:0, timeout:1000*60}, false);
				});

				await Armypaths.find({time:null, speed:{$ne:null}, distance:{$ne:null}}, {fields: {armyId:1, speed:1, distance:1}}).forEachAsync(async function(path) {
					await Queues.addAsyncOrLog('updatePathTime', {path:path}, {delay:0, timeout:1000*60}, false);
				});

				await Armypaths.find({dirtyMoveTotals:true, distance:{$ne:null}, time:{$ne:null}}, {fields: {armyId:1}}).forEachAsync(async function(path) {
					await Queues.addAsyncOrLog('updateArmyMoveTotals', {armyId:path.armyId}, {delay:0, timeout:1000*60}, false);
				});
      }
    });

    SyncedCron.add({
      name: '5 sec job',
      schedule: function(parser) {return parser.cron('*/5 * * * * *', true);},
      job: async function() {
				// Each of these does all the work that is due, so one of each, waiting
				// or running, is enough: while one is, the tick adds no other. Without
				// the uniqueId a slow run would let them pile up, one more every 5 seconds.
        await Queues.addAsyncOrLog('moveArmiesJob', {}, {delay:0, timeout:1000*60}, 'every5sec');

				await Queues.addAsyncOrLog('collectCastleIncome', {}, {delay:0, timeout:1000*60*5}, 'every5sec');
  			await Queues.addAsyncOrLog('collectVillageIncome', {}, {delay:0, timeout:1000*60*5}, 'every5sec');
  			await Queues.addAsyncOrLog('collectCapitalIncome', {}, {delay:0, timeout:1000*60*5}, 'every5sec');
      }
    });

    SyncedCron.add({
      name: 'battle job',
      schedule: function(parser) {return parser.cron('*/20 * * * * *', true);},
      job: async function() {
        await Games.find({hasStarted:true, hasEnded:false}, {fields: {_id:1}}).forEachAsync(async function(game) {
          let interval = _gs.battles(game._id, 'battleInterval');
          let cutoff = moment(dClock.now()).subtract(interval, 'ms').toDate();
          await Battles2.find({gameId:game._id, isOver:false, updatedAt: {$lt:cutoff}}, {fields: {gameId:1, x:1, y:1}}).forEachAsync(async function(battle) {
            await Queues.addAsyncOrLog('runBattle', {gameId:battle.gameId, x:battle.x, y:battle.y}, {delay:0, timeout:1000*60*5}, battle.gameId+'_'+battle.x+'_'+battle.y);
          })
        });
      }
    });

    SyncedCron.add({
      name: '1 min job',
      schedule: function(parser) {return parser.cron('* * * * *');},
      job: async function() {
        await Queues.addAsyncOrLog('checkForGameClose', {}, {delay:0, timeout:1000*60*5}, false);
        await Queues.addAsyncOrLog('checkForGameEnd', {}, {delay:0, timeout:1000*60*5}, false);
        await Queues.addAsyncOrLog('checkForGameStart', {}, {delay:0, timeout:1000*60*5}, false);
				await Games.find({hasStarted:true, hasEnded:false}, {fields: {_id:1}}).forEachAsync(async function(game) {
	        await Queues.addAsyncOrLog('villageConstructionJob', {gameId:game._id}, {delay:0, timeout:1000*60*5}, false);
	      });
      }
    });

    SyncedCron.add({
      name: '5 min job',
      schedule: function(parser) {return parser.cron('*/5 * * * *');},
      job: async function() {
        await Queues.addAsyncOrLog('expirePastMoves', {}, {delay:0, timeout:1000*60}, false);
      }
    });

    SyncedCron.add({
      name: '10 min job',
      schedule: function(parser) {return parser.cron('*/10 * * * *');},
      job: async function() {
        await Games.find({hasStarted:true, hasEnded:false}, {fields: {_id:1}}).forEachAsync(async function(game) {
  				await Queues.addAsyncOrLog('gamestats_job', {gameId:game._id}, {delay:0, timeout:1000*60}, game._id);
  				await Queues.addAsyncOrLog('updateIncomeRank', {gameId:game._id}, {delay:0, timeout:1000*60}, game._id);
  				await Queues.addAsyncOrLog('updateVassalRank', {gameId:game._id}, {delay:0, timeout:1000*60}, game._id);
  			});
      }
    });

    SyncedCron.add({
      name: '30 min job',
      schedule: function(parser) {return parser.cron('*/30 * * * *');},
      job: async function() {
        await Games.find({hasStarted:true, hasEnded:false}, {fields: {_id:1}}).forEachAsync(async function(game) {
          await Queues.addAsyncOrLog('record_market_history', {gameId:game._id, quantity:0}, {delay:0, timeout:1000*60*5}, false);
      		await Queues.addAsyncOrLog('spendTaxes', {gameId:game._id}, {delay:0, timeout:1000*60*5}, game._id);
      		await Queues.addAsyncOrLog('generateTree', {gameId:game._id}, {delay:0, timeout:1000*60*5}, game._id);
      		await Queues.addAsyncOrLog('updateIncomeStats', {gameId:game._id}, {delay:0, timeout:1000*60*5}, game._id);
					await Queues.addAsyncOrLog('removeStuckBattles', {}, {delay:0, timeout:1000*60}, false);
  			});
      }
    });

    SyncedCron.add({
      name: 'midnight job',
      schedule: function(parser) {return parser.cron('00 00 * * *');},
      job: async function() {
				await Queues.addAsyncOrLog('resetQueueStats', {}, {delay:0, timeout:1000*60*5}, false);
        await Games.find({hasStarted:true, hasEnded:false}, {fields: {_id:1}}).forEachAsync(async function(game) {
      		await Queues.addAsyncOrLog('dailystatsNumVassalsEveryone', {gameId:game._id}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60}, game._id);
      	});

				// one job for every game: it pauses the queues once, not once per game.
				// No retries: a failed game is logged and skipped inside the job.
				await Queues.addAsyncOrLog('updateAllKingsAllies', {}, {delay:0, timeout:1000*60*10}, 'allGames');
      }
    });
  }
});
