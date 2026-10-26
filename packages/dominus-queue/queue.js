// redis 6379 is dev
// redis 6380 is production

// todo
// add timestamp to redis
// when adding check timestamp, check if too old

Queue = Npm.require('bull');

Queues = {
  queueNames: [],
  settings: {
    host: 'localhost',
    port: 6379
  }
};

if (!Meteor.settings.public.dominusIsDev) {
  Queues.settings.host = process.env.DOMINUS_REDIS_HOST;
  Queues.settings.port = process.env.DOMINUS_REDIS_PORT;
}

// Bull's settings for every queue.
// maxStalledCount 0: a job whose worker stopped renewing its lock (the worker
// died, or its event loop was blocked for longer than lockDuration) is failed,
// not run a second time. Bull's default runs it again, and most of our jobs are
// not safe to run twice (income, a battle round, a new player). Before Bull 4
// such work was lost too, since Bull counted the job done when it started.
Queues.bullSettings = {
  maxStalledCount: 0
};

// how ioredis reaches Redis; unset values fall back to ioredis's defaults
Queues.redisOptions = function() {
  return {
    host: Queues.settings.host || undefined,
    port: Number(Queues.settings.port) || undefined
  };
};

// Meteor.startup(function() {
//   if (process.env.DOMINUS_WORKER == 'true') {
//     let matador = Npm.require('bull-ui/app')({
//       redis: {
//         host: Queues.settings.host,
//         port: Queues.settings.port,
//         //password: Queues.settings.options.password,
//         options: Queues.settings.options
//       }
//     });
//     matador.listen(3020);
//   }
// });


Queues.trackJob = async function(type, duration) {
  if (type && duration) {
    await KueStats.upsertAsync({type:type}, {
      $setOnInsert: {type:type},
      $set: {lastDuration:duration, lastDate:new Date()},
      $inc: {timesRun:1, totalDuration:duration}
    });
  }
}


// Every job handler runs through Queues.runJob, so Bull counts a job as done
// when its work is done. Before Bull 4, handlers were wrapped in
// Meteor.bindEnvironment and Bull called them outside a fiber, so the wrapper
// started a fiber and returned to Bull as soon as the handler first waited on
// the database: Bull marked the job completed while its work was still
// running, and a job's timeout, lock and concurrency never applied.
//
// runJob runs the handler in Meteor's environment and resolves once the
// promise it returns settles. It never rejects: a handler that throws is
// logged as "Exception in job <name>" and its job still completes. So Bull
// never retries a job, and Queues.jobOptions sets attempts to 1 to keep it that
// way: most jobs are not safe to run twice once they have done part of their
// work.
//
// runJob also times the work (JobWorkStats, below) and releases the job's
// uniqueId when the work ends, which may be after Bull gave up on the job: a
// job that hits its timeout fails in Bull, but its work goes on, and until it
// stops no duplicate may be queued.

// the jobs whose work is running in this process, by Queues.runningKey
Queues.running = {};

Queues.runningKey = function(jobName, jobId) {
  return jobName + ':' + jobId;
};

Queues.isRunning = function(jobName, jobId) {
  return !!Queues.running[Queues.runningKey(jobName, jobId)];
};

Queues.runJob = function(jobName, handler) {
  return function(job) {
    return new Promise(function(resolve) {
      const key = Queues.runningKey(jobName, job.id);
      const uniqueId = job.data && job.data.uniqueId;
      const start = Date.now();

      const finish = async function() {
        try {
          delete Queues.running[key];
          Queues.recordWork(jobName, Date.now() - start);
          if (uniqueId) {
            await Queues.removeUniqueId(jobName, uniqueId);
          }
        } catch (error) {
          console.error('could not finish job', jobName, error);
        }
        // settle Bull's promise from a timer callback (see below)
        setImmediate(resolve);
      };

      const work = async function() {
        Queues.running[key] = {jobName:jobName, jobId:job.id, uniqueId:uniqueId, startedAt:new Date(start)};
        // a job for a game that was just made, on another server, may come
        // before that server's insert reaches this one's settings cache
        if (job.data && typeof job.data.gameId === 'string') {
          try {
            await _gs.ensureGame(job.data.gameId);
          } catch (error) {
            console.error('job ' + jobName + ': could not read game ' + job.data.gameId + ' into the settings cache', error);
          }
        }
        try {
          await handler(job);
        } catch (error) {
          Meteor._debug('Exception in job ' + jobName, error && error.stack || error);
        }
        await finish();
      };

      // Bull calls this from a promise callback. The work is started from a
      // timer callback instead (Meteor.defer), and Bull's promise is settled
      // from one: on Meteor 2.16, Node 14 aborts (AsyncHooks::
      // push_async_context) when a fiber started from a promise callback
      // switches while Bull waits on that promise. Meteor.defer also gives
      // the work Meteor's environment (on 2.16, a fiber of its own). On 2.16
      // Meteor.defer must itself be called in a fiber, and this may be called
      // outside one, so it is called from a promise callback, which 2.16 runs
      // in a fiber (it returns at once, so that fiber never switches).
      Promise.resolve().then(function() {
        Meteor.defer(work);
      }).catch(function(error) {
        console.error('could not start job', jobName, error);
        return finish();
      });
    });
  };
};

// resolves once no job's work is running in this process, or after ms
Queues.whenIdle = function(ms) {
  const end = Date.now() + ms;
  return new Promise(function(resolve) {
    const check = function() {
      if (_.isEmpty(Queues.running) || Date.now() >= end) {
        resolve(_.isEmpty(Queues.running));
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
};


// The work time of every job, kept in memory and added to JobWorkStats, one
// doc per job type and UTC day, once a minute. Used to set the job timeouts,
// lock durations and concurrency.
Queues.workTimes = {};

Queues.recordWork = function(type, duration) {
  let t = Queues.workTimes[type];
  if (!t) {
    t = Queues.workTimes[type] = {count:0, total:0, max:0, last:0};
  }
  t.count++;
  t.total += duration;
  t.max = Math.max(t.max, duration);
  t.last = duration;
};

Queues.workDay = function() {
  return new Date().toISOString().slice(0, 10);
};

Queues.flushWorkTimes = async function() {
  let times = Queues.workTimes;
  let day = Queues.workDay();
  Queues.workTimes = {};
  for (const type of _.keys(times)) {
    const t = times[type];
    await JobWorkStats.upsertAsync({type:type, day:day}, {
      $setOnInsert: {type:type, day:day},
      $set: {last:t.last, updatedAt:new Date()},
      $inc: {count:t.count, total:t.total},
      $max: {max:t.max}
    });
  }
};


// Bull emits 'failed' after every failed attempt. A job's uniqueId is released
// here only when nothing else will release it:
// - a job whose work is still running in this process (it hit its timeout,
//   or lost its lock) keeps its id: runJob releases it when the work ends;
// - a job that will be retried keeps its id until it finally fails (attempts
//   are always 1 now, but the rule stays right if retries are turned on);
// - any other failure (a job left behind by a worker that died) releases it.
Queues.onJobFailed = async function(job, error) {
  if (!job || !job.data || !job.data.uniqueId) {
    return;
  }

  if ((error && error.name === 'TimeoutError') || Queues.isRunning(job.data.jobName, job.id)) {
    return;
  }

  let isFailed;
  try {
    isFailed = await job.isFailed();
  } catch (error) {
    console.error('could not read state of failed job', job.data.jobName, error);
    isFailed = true;
  }

  if (isFailed) {
    await Queues.removeUniqueId(job.data.jobName, job.data.uniqueId);
  }
};


// Bull and ioredis report Redis trouble as 'error' events on a queue. An
// 'error' event without a listener throws, so every queue gets one. While Redis
// is down every connection reports every retry, so the same message is logged
// at most once a minute per queue.
Queues.errorLogMs = 1000*60;
Queues._lastErrors = {};

Queues.onQueueError = function(jobName, error) {
  const message = String(error && error.message || error);
  const key = jobName + ' ' + message;
  const now = Date.now();
  if (Queues._lastErrors[key] && now - Queues._lastErrors[key] < Queues.errorLogMs) {
    return false;
  }
  Queues._lastErrors[key] = now;
  console.error('job queue ' + jobName + ' error:', error && error.stack || error);
  return true;
};


// Bull 2 kept a queue's completed and failed jobs in Redis sets; Bull 3 and
// later keep them in sorted sets under the same keys. A Bull 4 worker that
// finds a Bull 2 set there can't finish any job of that queue (WRONGTYPE), so
// before a worker takes jobs from a queue, and every minute after that (an old
// worker that is still shutting down may write one again), the Bull 2 sets
// are deleted, with the jobs they list. Those are only finished jobs, which
// the clean-up cron would delete within hours anyway. Waiting, delayed and
// active jobs are stored the same way in both, and are kept.
// Resolves with the names of the sets it deleted.
Queues.dropBull2Keys = async function(jobName) {
  const queue = Queues[jobName];
  const client = queue.client;
  const dropped = [];
  for (const state of ['completed', 'failed']) {
    const key = queue.toKey(state);
    if (await client.type(key) !== 'set') {
      continue;
    }
    const ids = await client.smembers(key);
    for (let i = 0; i < ids.length; i += 500) {
      const keys = ids.slice(i, i + 500).map(function(id) { return queue.toKey(id); });
      await client.del(keys);
    }
    await client.del(key);
    dropped.push(state);
  }
  if (dropped.length) {
    console.log('--- job queue ' + jobName + ': deleted the Bull 2 ' + dropped.join(' and ') + ' jobs ---');
  }
  return dropped;
};


// how many jobs of a type one worker runs at a time, when the handler doesn't
// say (Queues.<name>.process(concurrency, handler))
Queues.defaultConcurrency = 1;


// create a job queue
Queues.create = function(jobName) {
  check(jobName, String);
  var self = this;

  Queues[jobName] = new Queue(jobName, {
    redis: self.redisOptions(),
    settings: _.clone(self.bullSettings)
  });
  self.queueNames = _.union(self.queueNames, jobName);

  Queues[jobName].on('error', function(error) {
    Queues.onQueueError(jobName, error);
  });

  // run every handler through Queues.runJob. The handler itself is kept as
  // .handler, for tests that call it directly (dTest.runJob).
  let bullProcess = Queues[jobName].process;
  Queues[jobName].process = function(concurrency, handler) {
    if (typeof concurrency === 'function') {
      handler = concurrency;
      concurrency = Queues.defaultConcurrency;
    }
    this.handler = handler;
    this.concurrency = concurrency;
    const queue = this;
    // resolves when the queue closes; rejects if it can't start. No job runs
    // before the settings cache holds every game (_gs.ready never rejects).
    return Promise.resolve(_gs.ready).then(function() {
      return Queues.dropBull2Keys(jobName);
    }).catch(function(error) {
      console.error('could not check job queue ' + jobName + ' for Bull 2 keys:', error);
    }).then(function() {
      return bullProcess.call(queue, concurrency, Queues.runJob(jobName, handler));
    }).catch(function(error) {
      console.error('job queue ' + jobName + ' stopped:', error);
    });
  };

  if (process.env.DOMINUS_WORKER == 'true') {

    Queues[jobName].on('active', Meteor.bindEnvironment(function(job, jobPromise) {
      job.data.activeDate = new Date().getTime();
    }));


    Queues[jobName].on('failed', Meteor.bindEnvironment(function(job, error) {
      Queues.onJobFailed(job, error).catch(function(error) {
        console.error('could not release the uniqueId of failed job', jobName, error);
      });
    }));


    // A stalled job is failed (maxStalledCount 0), and its 'failed' event
    // releases its uniqueId (onJobFailed). Nothing listens to 'stalled'.


    Queues[jobName].on('completed', Meteor.bindEnvironment(function(job, result) {

      // track job time
      if (job.data.jobName != 'runBattle') {
        if (job.data.activeDate) {
          const duration = new Date().getTime() - new Date(job.data.activeDate).getTime();
          Queues.trackJob(job.data.jobName, duration).catch(function(error) {
            console.error('could not track job', job.data.jobName, error);
          });
        }
      }

      // the uniqueId was released by runJob when the work ended

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
    Meteor.setInterval(function() {
      Queues.flushWorkTimes().catch(function(error) {
        console.error('could not save job work times', error);
      });
    }, 1000*60);


    SyncedCron.add({
      name: 'clean up old jobs',
      schedule: function(parser) {return parser.cron('* * * * *');},
      job: function() {
        const logError = function(error) {
          console.error('could not clean old jobs', error);
        };
        Queues.queueNames.forEach(function(jobName) {
          Queues.dropBull2Keys(jobName).catch(logError);
          Queues[jobName].clean(1000*60*60*6, 'failed').catch(logError);
          Queues[jobName].clean(1000*60*5, 'completed').catch(logError);
          Queues[jobName].clean(1000*60*60, 'wait').catch(logError);
          Queues[jobName].clean(1000*60*60, 'active').catch(logError);
        });
      }
    });
  }
});



// Bull's options for a job. Retries stay off (see Queues.runJob): many calls
// still pass attempts and backoff from when they seemed to work, and those
// are dropped. A job's timeout is kept: a job that runs past it fails in Bull
// and frees its place in the queue, while its work runs on and keeps its
// uniqueId until it ends.
Queues.jobOptions = function(options) {
  options = _.omit(options || {}, 'attempts', 'backoff');
  options.attempts = 1;
  return options;
};


// Add a job: resolves once Redis has the job (or the job was skipped as a
// duplicate), with true if it was added; rejects if Redis refuses it. A
// uniqueId (a string; false for none) skips the job while another job with
// that id waits or runs.
Queues.addAsync = async function(jobName, data, options, uniqueId) {
  check(jobName, String);
  check(data, Object);
  check(options, Object);
  check(uniqueId, Match.OneOf(Boolean, String));

  const queue = Queues[jobName];

  if (uniqueId) {
    if (!await Queues.addUniqueId(jobName, uniqueId)) {
      return false;
    }
    // so runJob can release it when the work ends
    data.uniqueId = uniqueId;
  }

  // used when releasing the uniqueId
  data.jobName = jobName;

  try {
    await queue.add(data, Queues.jobOptions(options));
  } catch (error) {
    if (uniqueId) {
      await Queues.removeUniqueId(jobName, uniqueId);
    }
    throw error;
  }
  return true;
};


// Queues.addAsync for callers that carry on when a job can't be added: it
// logs the error and resolves with false.
Queues.addAsyncOrLog = function(jobName, data, options, uniqueId) {
  return Queues.addAsync(jobName, data, options, uniqueId).catch(function(error) {
    console.error('could not add job', jobName, error);
    return false;
  });
};



Meteor.startup(function() {
  Queues.resetQueueStats.process(async function(job) {
    await KueStats.removeAsync({});
  });
});




// called from admin ui
// a failed delete is ignored, as before
Queues.clearUniqueIdsForJob = async function(jobName) {
  const queue = Queues[jobName];

  if (!queue) {
    return;
  }

  // the per-id keys, plus the list key the old code used
  let keys = (await Queues._uniqueKeysForJob(jobName)).concat([Queues.getKeyString(jobName)]);
  await queue.client.del(keys).catch(function() {});
}


// Pause every queue on every worker (Bull global pause, stored in Redis).
// isManual marks a pause made from the admin panel, which the stuck-pause
// safety net below leaves alone. If any queue fails to pause, everything is
// resumed again and this rejects, so a failed pause never leaves the game
// half-stopped.
Queues.pauseAllAsync = async function(isManual) {
  await Settings.upsertAsync({}, {$set: {isPaused:true, pausedAt:new Date(), manualPause:!!isManual}});

  let errors = [];
  for (const jobName of Queues.queueNames) {
    try {
      await Queues[jobName].pause();
    } catch (error) {
      errors.push(jobName + ': ' + (error || new Error('unknown error')).message);
    }
  }

  if (errors.length) {
    console.error('--- could not pause job queue, resuming ---', errors);
    try {
      await Queues.resumeAllAsync();
    } catch (error) {
      // the safety net retries the resume
    }
    throw new Meteor.Error('pause-failed', errors.join('; '));
  }
};


// Resume every queue. Tries all of them even if one fails. If any failed,
// Settings keeps isPaused so the safety net retries, and this rejects.
Queues.resumeAllAsync = async function() {
  let errors = [];
  for (const jobName of Queues.queueNames) {
    try {
      await Queues[jobName].resume();
    } catch (error) {
      errors.push(jobName + ': ' + (error || new Error('unknown error')).message);
    }
  }

  if (errors.length) {
    console.error('--- could not resume job queue ---', errors);
    throw new Meteor.Error('resume-failed', errors.join('; '));
  }

  await Settings.upsertAsync({}, {$set: {isPaused:false}, $unset: {pausedAt:'', manualPause:''}});
};


// Safety net: a pause made by server code (not from the admin panel) that is
// still in place after maxMs is treated as stuck and resumed.
Queues.stuckPauseMaxMs = 1000*60*15;

Queues.resumeIfStuck = async function(now) {
  let settings = await Settings.findOneAsync({}, {fields: {isPaused:1, pausedAt:1, manualPause:1}});
  if (!settings || !settings.isPaused || settings.manualPause) {
    return false;
  }

  // a pause from before pausedAt existed has no time; treat it as stuck
  let pausedAt = settings.pausedAt ? settings.pausedAt.getTime() : 0;
  if ((now || new Date()).getTime() - pausedAt < Queues.stuckPauseMaxMs) {
    return false;
  }

  console.error('--- job queue paused since ' + settings.pausedAt + ', resuming ---');
  await Queues.resumeAllAsync();
  return true;
};

Meteor.startup(function() {
  if (process.env.DOMINUS_WORKER == 'true') {
    SyncedCron.add({
      name: 'resume stuck job queue',
      schedule: function(parser) {return parser.cron('* * * * *');},
      job: async function() {
        await Queues.resumeIfStuck();
      }
    });
  }
});



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



// Each uniqueId is its own Redis key that expires after 20 minutes, set with
// SET NX so checking and adding is one atomic step. The old code kept all ids
// of a job type in one JSON list and rewrote it with GET then SET, so two
// processes could undo each other's change, and a bug dropped every stored id
// on the next add.
Queues.uniqueIdTtlMs = 1000*60*20;

// returns true if the id was free and is now taken, false if it is already taken
// resolves with true if the id was free and is now taken, false if it is
// already taken
Queues.addUniqueId = async function(jobName, uniqueId) {
  let result;
  try {
    result = await Queues[jobName].client.set(Queues.getKeyString(jobName, uniqueId), '1', 'PX', Queues.uniqueIdTtlMs, 'NX');
  } catch (error) {
    // if Redis can't answer, queue the job: a duplicate is safer than a lost job
    console.error('could not check uniqueId', jobName, uniqueId, error);
    return true;
  }
  return result === 'OK';
}


// a failed delete is ignored, as before: the id expires on its own
Queues.removeUniqueId = async function(jobName, uniqueId) {
  await Queues[jobName].client.del(Queues.getKeyString(jobName, uniqueId)).catch(function() {});
}


// keys of the stored ids of a job type
Queues._uniqueKeysForJob = async function(jobName) {
  const client = Queues[jobName].client;
  const pattern = Queues.getKeyString(jobName) + ':*';
  let keys = [];
  let cursor = '0';
  do {
    let reply = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
    cursor = reply[0];
    keys = keys.concat(reply[1]);
  } while (cursor !== '0');
  return _.uniq(keys);
}


// the ids currently stored for a job type
Queues.getUniqueIds = async function(jobName) {
  const prefix = Queues.getKeyString(jobName) + ':';
  return (await Queues._uniqueKeysForJob(jobName)).map(function(key) {
    return key.substring(prefix.length);
  });
}


// with a uniqueId: that id's key; without: the job type's prefix (and the
// key of the old list)
Queues.getKeyString = function(jobName, uniqueId) {
  let key = 'dominus:unique:'+jobName;
  if (uniqueId !== undefined) {
    key += ':'+uniqueId;
  }
  return key;
}
