// redis 6379 is dev
// redis 6380 is production

// todo
// add timestamp to redis
// when adding check timestamp, check if too old

Future = Npm.require('fibers/future');
Queue = Npm.require('bull');

Queues = {
  queueNames: [],
  settings: {
    host: 'localhost',
    port: 6379,
    options: {}
  }
};

if (!Meteor.settings.public.dominusIsDev) {
  Queues.settings.host = process.env.DOMINUS_REDIS_HOST;
  Queues.settings.port = process.env.DOMINUS_REDIS_PORT;
  Queues.settings.options = {no_ready_check: true};
}

Meteor.startup(function() {
  if (process.env.DOMINUS_WORKER == 'true') {
    let matador = Npm.require('bull-ui/app')({
      redis: {
        host: Queues.settings.host,
        port: Queues.settings.port,
        //password: Queues.settings.options.password,
        options: Queues.settings.options
      }
    });
    matador.listen(3020);
  }
});


Queues.trackJob = function(type, duration) {
  if (type && duration) {
    KueStats.upsert({type:type}, {
      $setOnInsert: {type:type},
      $set: {lastDuration:duration, lastDate:new Date()},
      $inc: {timesRun:1, totalDuration:duration}
    });
  }
}


// create a job queue
Queues.create = function(jobName) {
  check(jobName, String);
  var self = this;

  Queues[jobName] = Queue(jobName, self.settings.port, self.settings.host, self.settings.options);
  self.queueNames = _.union(self.queueNames, jobName);

  if (process.env.DOMINUS_WORKER == 'true') {

    Queues[jobName].on('active', Meteor.bindEnvironment(function(job, jobPromise) {
      job.data.activeDate = new Date().getTime();
    }));


    Queues[jobName].on('failed', Meteor.bindEnvironment(function(job, error) {
      // remove unique job
      if (job.data.uniqueId) {
        Queues.removeUniqueId(job.data.jobName, job.data.uniqueId)
      }
    }));


    Queues[jobName].on('stalled', Meteor.bindEnvironment(function(job) {
      // remove unique job
      if (job.data.uniqueId) {
        Queues.removeUniqueId(job.data.jobName, job.data.uniqueId)
      }

      //job.remove();
    }));


    Queues[jobName].on('completed', Meteor.bindEnvironment(function(job, result) {

      // track job time
      if (job.data.jobName != 'runBattle') {
        if (job.data.activeDate) {
          const duration = new Date().getTime() - new Date(job.data.activeDate).getTime();
          Queues.trackJob(job.data.jobName, duration);
        }
      }

      // remove unique job
      if (job.data.uniqueId) {
        Queues.removeUniqueId(job.data.jobName, job.data.uniqueId)
      }

      //job.remove();
    }));
  }
};


Queues.create('updateMoveSpeed');
Queues.create('updatePathTime');
Queues.create('updateArmyMoveTotals');
Queues.create('enterNewHexCheck');
Queues.create('expirePastMoves');
Queues.create('moveArmiesJob');
Queues.create('runBattle');
Queues.create('createPlayer');
Queues.create('updateKingChatroom');
Queues.create('destroyKingChatroom');
Queues.create('setupEveryoneChatroom');
Queues.create('cleanupAllKingChatrooms');
Queues.create('mailTemplateToOldProUsers');
Queues.create('sendToMailingList');
Queues.create('addToMailingList');
Queues.create('deleteGameAccount');
Queues.create('update_losses_worth');
Queues.create('updateIncomeStats');
Queues.create('updateIncomeRank');
Queues.create('updateVassalRank');
Queues.create('initDailystatsForNewUser');
Queues.create('dailystatsNumVassalsEveryone');
Queues.create('collectCapitalIncome');
Queues.create('collectCastleIncome');
Queues.create('collectVillageIncome');
Queues.create('spendTaxes');
Queues.create('updateAllKingsAllies');
Queues.create('updateVassalAllyCountMultiple');
Queues.create('enemy_on_building_check');
Queues.create('enemies_together_check');
Queues.create('checkForDominus');
Queues.create('removeDominus');
Queues.create('checkForGameClose');
Queues.create('checkForGameEnd');
Queues.create('checkForGameStart');
Queues.create('sendGameStartedEmail');
Queues.create('gamestats_job');
Queues.create('bakeCountries');
Queues.create('bakeCountry');
// Queues.create('createJpgImage');
// Queues.create('uploadToS3');
Queues.create('finishImage');
Queues.create('pathToHex');
Queues.create('createCountryMask');
Queues.create('findCountriesInPath');
Queues.create('record_market_history');
Queues.create('generateGameMinimap');
Queues.create('generateAllMinimaps');
Queues.create('villageConstructionJob');
Queues.create('destroyVillage');
Queues.create('fixPathIndexes');
Queues.create('removeStuckBattles');
Queues.create('resetQueueStats');



// clean jobs
Meteor.startup(function() {
  if (process.env.DOMINUS_WORKER == 'true') {
    SyncedCron.add({
      name: 'clean up old jobs',
      schedule: function(parser) {return parser.cron('* * * * *');},
      job: function() {
        Queues.queueNames.forEach(function(jobName) {
          Queues[jobName].clean(1000*60*60*6, 'failed');
          Queues[jobName].clean(1000*60*5, 'completed');
          Queues[jobName].clean(1000*60*60, 'wait');
          Queues[jobName].clean(1000*60*60, 'active');
        });
      }
    });
  }
});



// add a job to the job queue
Queues.add = function(jobName, data, options, uniqueId) {
  check(jobName, String);
  check(data, Object);
  check(options, Object);
  check(uniqueId, Match.OneOf(Boolean, String));

  // unique jobs
  if (uniqueId) {
    let added = Queues.addUniqueId(jobName, uniqueId);

    // uniqueId is already in db
    // skip job
    if (!added) {
      return;
    }

    // add uniqueId to data so we can remove it later
    data.uniqueId = uniqueId;
  }

  // used when removing uniqueId
  data.jobName = jobName;

  // check that job exists
  // if (!_.contains(Queues.queueNames, jobName)) {
  //   console.error('Job', jobName, 'not found.', Queues.queueNames, data, options, uniqueId);
  // }

  Queues[jobName].add(data, options);
};



Meteor.startup(function() {
  Queues.resetQueueStats.process(Meteor.bindEnvironment(function(job) {
		KueStats.remove({});
    return Promise.resolve();
	}));
});




// called from admin ui
Queues.clearUniqueIdsForJob = function(jobName) {
  const uniqueKey = Queues.getKeyString(jobName);
  const queue = Queues[jobName];

  if (!queue) {
    return;
  }

  let future = new Future();
  queue.client.set(uniqueKey, EJSON.stringify([]), Meteor.bindEnvironment(function(error, result) {
    future.return(result);
  }));
  future.wait();
}



// ---------------------



// graceful shutdown
// Meteor.startup(function() {
//   if (process.env.DOMINUS_WORKER == 'true') {
//
//     process.once('SIGTERM', function (sig) {
//       console.log('--- shutting down queue from SIGTERM ---');
//       Queues.gracefulShutdown();
//     });
//
//     // process.once('SIGINT', function(sig) {
//     //   console.log('--- shutting down queue from SIGINT ---');
//     //   Queues.gracefulShutdown();
//     // });
//
//     Queues.gracefulShutdown = function() {
//       let promises = [];
//
//       Queues.queueNames.forEach(function(jobName) {
//         promises.push(Queues[jobName].close());
//       });
//
//       Promise.all(promises).then(function() {
//         console.log('--- queue done shutting down ----');
//         process.exit(0);
//       });
//     }
//   }
// });



Queues.addUniqueId = function(jobName, uniqueId) {
  // cutoff, delete uniqueIds past this time
  let cutoff = moment().subtract(20, 'minutes');

  let uniques = Queues.getUniqueIds(jobName);
  const uniqueKey = Queues.getKeyString(jobName);

  // remove old uniqueIds
  uniques = uniques.filter(function(u) {
    let arr = u.split('$');
    // if id has date in it
    if (arr.length == 2) {
      // keep if date is after cutoff
      let date = moment(new Date(arr[1]));
      return date.isAfter(cutoff);
    } else {
      // if no date then keep
      // all new ones should have date
      // old ones don't, can remove this later
      return true;
    }
  });

  // check if uniqueId is in redis
  let id = _.find(uniques, function(u) {
    let arr = u.split('$');
    return arr[0] == uniqueId;
  });

  // do not add job if found
  if (id) {
    return false
  }

  // add uniqueId to redis
  uniques = _.union(uniques, uniqueId+'$'+new Date().getTime());
  uniques = EJSON.stringify(uniques);

  let futureSet = new Future();
  Queues[jobName].client.set(uniqueKey, uniques, Meteor.bindEnvironment(function(error, result) {
    futureSet.return(result);
  }));
  futureSet.wait();
  return true;
}


Queues.removeUniqueId = function(jobName, uniqueId) {
  let uniques = Queues.getUniqueIds(jobName);
  const uniqueKey = Queues.getKeyString(jobName);

  // remove
  uniques = _.filter(uniques, function(u) {
    let arr = u.split('$');
    return arr[0] == uniqueId;
  });

  const newUniquesString = EJSON.stringify(uniques);

  let futureSet = new Future();
  Queues[jobName].client.set(uniqueKey, newUniquesString, Meteor.bindEnvironment(function(error, result) {
    futureSet.return(result);
  }));
  futureSet.wait();
}


Queues.getUniqueIds = function(jobName) {
  let uniques = [];
  const uniqueKey = 'dominus:unique:'+jobName;

  let future = new Future();
  Queues[jobName].client.get(uniqueKey, Meteor.bindEnvironment(function(error, result) {
    future.return(result);
  }));
  const uniquesString = future.wait();

  if (uniquesString) {
    uniques = EJSON.parse(uniquesString);
  }

  return uniques;
}


Queues.getKeyString = function(jobName) {
  return 'dominus:unique:'+jobName;
}
