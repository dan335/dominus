// Regression tests for the server performance fixes (Oct 2026): job dedupe,
// the midnight relationship rebuild, the new indexes and the gameId lookups.
// They run as part of runGameCreationTests (server/gameCreationTests.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  // test queues are created on first use and kept for the life of the process
  // (Bull allows one handler per queue)
  var testQueueBehavior = null;
  var perfFixFiberDone = false;

  function testQueue() {
    if (!Queues.perfFixTestQueue) {
      Queues.create('perfFixTestQueue');
      if (process.env.DOMINUS_WORKER == 'true') {
        // a plain handler (no fiber), so the promise it returns is what Bull sees
        Queues.perfFixTestQueue.process(function(job) {
          return testQueueBehavior ? testQueueBehavior(job) : Promise.resolve();
        });
      }
    }
    return Queues.perfFixTestQueue;
  }

  _perfFixTests = function(run, t) {
    var assert = t.assert;
    var equal = t.equal;


    // --- Helpers ---

    function stub(obj, key, value) {
      var had = Object.prototype.hasOwnProperty.call(obj, key);
      var original = obj[key];
      obj[key] = value;
      return function() {
        if (had) {
          obj[key] = original;
        } else {
          delete obj[key];
        }
      };
    }

    function restoreAll(restores) {
      restores.reverse().forEach(function(restore) { restore(); });
    }

    function waitFor(fn, ms) {
      var end = Date.now() + (ms || 10000);
      while (Date.now() < end) {
        if (fn()) return true;
        Meteor._sleepForMs(100);
      }
      return !!fn();
    }

    // run a Bull/ioredis promise inside the fiber
    function awaitPromise(promise) {
      var Future = Npm.require('fibers/future');
      var future = new Future();
      promise.then(function(result) {
        future.return({result: result});
      }).catch(function(error) {
        future.return({error: error});
      });
      var out = future.wait();
      if (out.error) throw out.error;
      return out.result;
    }

    function storedIds(jobName) {
      return Queues.getUniqueIds(jobName).sort();
    }

    function fakeJob(jobName, uniqueId, isFailed) {
      return {
        data: {jobName: jobName, uniqueId: uniqueId},
        isFailed: function() { return isFailed(); }
      };
    }

    var isWorker = process.env.DOMINUS_WORKER == 'true';


    // --- #1 Job dedupe (Queues.removeUniqueId, Queues.onJobFailed) ---

    run('removeUniqueId removes only the given id and keeps the others', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      Queues.clearUniqueIdsForJob(name);
      try {
        assert(Queues.addUniqueId(name, 'a'), 'a added');
        assert(Queues.addUniqueId(name, 'b'), 'b added');
        assert(Queues.addUniqueId(name, 'c'), 'c added');

        Queues.removeUniqueId(name, 'b');

        equal(JSON.stringify(storedIds(name)), JSON.stringify(['a', 'c']), 'a and c are still stored');
      } finally {
        Queues.clearUniqueIdsForJob(name);
      }
    });

    run('addUniqueId keeps the ids already stored (they used to be dropped on every add)', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      Queues.clearUniqueIdsForJob(name);
      try {
        Queues.addUniqueId(name, 'a');
        Queues.addUniqueId(name, 'b');
        Queues.addUniqueId(name, 'c');
        equal(JSON.stringify(storedIds(name)), JSON.stringify(['a', 'b', 'c']), 'all three stored');
        equal(Queues.addUniqueId(name, 'a'), false, 'a is still deduped after later adds');
      } finally {
        Queues.clearUniqueIdsForJob(name);
      }
    });

    run('removeUniqueId of an id that is not stored changes nothing', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      Queues.clearUniqueIdsForJob(name);
      try {
        Queues.addUniqueId(name, 'a');
        Queues.addUniqueId(name, 'b');

        Queues.removeUniqueId(name, 'zzz');

        equal(JSON.stringify(storedIds(name)), JSON.stringify(['a', 'b']), 'a and b are still stored');
      } finally {
        Queues.clearUniqueIdsForJob(name);
      }
    });

    run('addUniqueId refuses a stored id and accepts it again once removed', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      Queues.clearUniqueIdsForJob(name);
      try {
        assert(Queues.addUniqueId(name, 'a'), 'first add');
        Queues.addUniqueId(name, 'b');
        equal(Queues.addUniqueId(name, 'a'), false, 'duplicate refused');

        Queues.removeUniqueId(name, 'b');
        equal(Queues.addUniqueId(name, 'a'), false, 'removing another id does not release a');

        Queues.removeUniqueId(name, 'a');
        equal(Queues.addUniqueId(name, 'a'), true, 'accepted after its own removal');
      } finally {
        Queues.clearUniqueIdsForJob(name);
      }
    });

    run('ids are scoped to their job type', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      Queues.clearUniqueIdsForJob(name);
      try {
        Queues.addUniqueId(name, 'shared');
        equal(Queues.getUniqueIds('runBattle').indexOf('shared'), -1, 'not visible under another job');
        equal(Queues.getKeyString(name, 'shared'), 'dominus:unique:perfFixTestQueue:shared', 'key layout');
      } finally {
        Queues.clearUniqueIdsForJob(name);
      }
    });

    run('a stored id expires after 20 minutes', function() {
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      Queues.clearUniqueIdsForJob(name);
      try {
        Queues.addUniqueId(name, 'a');
        var ttl = awaitPromise(queue.client.pttl(Queues.getKeyString(name, 'a')));
        assert(ttl > 1000*60*19.5 && ttl <= 1000*60*20, 'ttl is 20 minutes, got ' + ttl);

        // an id whose key has expired can be added again
        awaitPromise(queue.client.set(Queues.getKeyString(name, 'b'), '1', 'PX', 50));
        Meteor._sleepForMs(150);
        equal(Queues.addUniqueId(name, 'b'), true, 'expired id accepted');
      } finally {
        Queues.clearUniqueIdsForJob(name);
      }
    });

    run('concurrent adds and removes never lose or bring back an id', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      var Future = Npm.require('fibers/future');
      Queues.clearUniqueIdsForJob(name);
      try {
        // keep0..keep29 are added; drop0..drop29 are added and removed, all interleaved
        var tasks = [];
        for (var i = 0; i < 30; i++) {
          (function(i) {
            tasks.push(Future.task(function() { Queues.addUniqueId(name, 'keep' + i); }));
            tasks.push(Future.task(function() {
              Queues.addUniqueId(name, 'drop' + i);
              Queues.removeUniqueId(name, 'drop' + i);
            }));
          })(i);
        }
        Future.wait(tasks);
        tasks.forEach(function(task) { task.get(); });

        var ids = storedIds(name);
        equal(ids.length, 30, 'exactly the 30 kept ids remain');
        assert(ids.every(function(id) { return id.indexOf('keep') === 0; }), 'no removed id came back');
      } finally {
        Queues.clearUniqueIdsForJob(name);
      }
    });

    run('addUniqueId lets the job through when Redis errors', function() {
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      var restores = [
        stub(queue.client, 'set', function() { _.last(arguments)(new Error('redis down')); }),
        stub(console, 'error', function() {})
      ];
      try {
        equal(Queues.addUniqueId(name, 'a'), true, 'job is queued rather than lost');
      } finally {
        restoreAll(restores);
        Queues.clearUniqueIdsForJob(name);
      }
    });

    run('clearUniqueIdsForJob removes every id and the old list key', function() {
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      try {
        Queues.addUniqueId(name, 'a');
        Queues.addUniqueId(name, 'b');
        awaitPromise(queue.client.set(Queues.getKeyString(name), '["old$1"]'));

        Queues.clearUniqueIdsForJob(name);

        equal(storedIds(name).length, 0, 'ids removed');
        equal(awaitPromise(queue.client.exists(Queues.getKeyString(name))), 0, 'old list key removed');
      } finally {
        Queues.clearUniqueIdsForJob(name);
      }
    });

    run('onJobFailed keeps the id while Bull will retry the job', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      Queues.clearUniqueIdsForJob(name);
      try {
        Queues.addUniqueId(name, 'a');
        Queues.onJobFailed(fakeJob(name, 'a', function() { return Promise.resolve(false); }));
        equal(JSON.stringify(storedIds(name)), JSON.stringify(['a']), 'id kept');
      } finally {
        Queues.clearUniqueIdsForJob(name);
      }
    });

    run('onJobFailed releases the id after the final failure, and only that id', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      Queues.clearUniqueIdsForJob(name);
      try {
        Queues.addUniqueId(name, 'a');
        Queues.addUniqueId(name, 'b');
        Queues.onJobFailed(fakeJob(name, 'a', function() { return Promise.resolve(true); }));
        equal(JSON.stringify(storedIds(name)), JSON.stringify(['b']), 'only a released');
      } finally {
        Queues.clearUniqueIdsForJob(name);
      }
    });

    run('onJobFailed releases the id when the job state cannot be read', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      Queues.clearUniqueIdsForJob(name);
      var restores = [stub(console, 'error', function() {})];
      try {
        Queues.addUniqueId(name, 'a');
        Queues.onJobFailed(fakeJob(name, 'a', function() { return Promise.reject(new Error('redis down')); }));
        equal(storedIds(name).length, 0, 'id released');
      } finally {
        restoreAll(restores);
        Queues.clearUniqueIdsForJob(name);
      }
    });

    run('onJobFailed ignores a job without a uniqueId', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      Queues.clearUniqueIdsForJob(name);
      try {
        Queues.addUniqueId(name, 'a');
        var asked = false;
        Queues.onJobFailed({data: {jobName: name}, isFailed: function() { asked = true; return Promise.resolve(true); }});
        equal(asked, false, 'state not read');
        equal(JSON.stringify(storedIds(name)), JSON.stringify(['a']), 'other ids untouched');
      } finally {
        Queues.clearUniqueIdsForJob(name);
      }
    });

    run('a stalled job keeps its uniqueId (no stalled handler releases it)', function() {
      if (!isWorker) return 'skip';
      equal(testQueue().listeners('stalled').length, 0, 'no stalled listener');
      equal(Queues.runBattle.listeners('stalled').length, 0, 'none on a real queue either');
    });

    run('real Bull job: a retried failure keeps the id, success releases it', function() {
      if (!isWorker) return 'skip';
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      Queues.clearUniqueIdsForJob(name);
      var attempts = 0;
      var heldDuringRetry = null;
      testQueueBehavior = function(job) {
        attempts++;
        if (attempts == 1) {
          return Promise.reject(new Error('first attempt fails'));
        }
        // second attempt: the id must still be stored at this point
        // (read Redis directly: this handler runs outside a fiber)
        return queue.client.exists(Queues.getKeyString(name, 'retryJob')).then(function(exists) {
          heldDuringRetry = exists;
        });
      };
      try {
        Queues.add(name, {test: 'retry'}, {attempts: 2, backoff: {type: 'fixed', delay: 1000}, delay: 0}, 'retryJob');

        assert(waitFor(function() { return attempts >= 1; }, 10000), 'first attempt ran');
        Meteor._sleepForMs(300);
        equal(Queues.addUniqueId(name, 'retryJob'), false, 'id still held after the retried failure');

        assert(waitFor(function() { return attempts >= 2; }, 10000), 'second attempt ran');
        equal(heldDuringRetry, 1, 'id held while the retry ran');
        assert(waitFor(function() { return storedIds(name).length === 0; }, 10000), 'id released after success');
      } finally {
        testQueueBehavior = null;
        Queues.clearUniqueIdsForJob(name);
      }
    });

    run('real Bull job: a final failure releases the id', function() {
      if (!isWorker) return 'skip';
      testQueue();
      var name = 'perfFixTestQueue';
      Queues.clearUniqueIdsForJob(name);
      var ran = false;
      testQueueBehavior = function(job) {
        ran = true;
        return Promise.reject(new Error('always fails'));
      };
      try {
        Queues.add(name, {test: 'final'}, {delay: 0}, 'finalJob');
        assert(waitFor(function() { return ran; }, 10000), 'job ran');
        assert(waitFor(function() { return storedIds(name).length === 0; }, 10000), 'id released');
        equal(Queues.addUniqueId(name, 'finalJob'), true, 'same id can be queued again');
      } finally {
        testQueueBehavior = null;
        Queues.clearUniqueIdsForJob(name);
      }
    });



    // --- #2 Midnight rebuild can't freeze the game (Queues.pauseAll/resumeAll,
    //        Queues.resumeIfStuck, dInit.updateAllKingsAlliesJob) ---

    function pausedQueues() {
      return Queues.queueNames.filter(function(jobName) {
        var queue = Queues[jobName];
        return awaitPromise(queue.client.exists(queue.toKey('meta-paused'))) === 1;
      });
    }

    function settingsDoc() {
      return Settings.findOne({}) || {};
    }

    // every test in this section must leave the server running
    function ensureResumed() {
      try {
        Queues.resumeAll();
      } catch (e) {
        console.error('perfFixTests could not resume the queues', e);
      }
    }

    run('pauseAll pauses every queue and records when; resumeAll undoes both', function() {
      testQueue();
      // guard against a vacuous pass: the real queues must be in the list
      assert(Queues.queueNames.indexOf('runBattle') !== -1, 'queueNames lists runBattle');
      assert(Queues.queueNames.indexOf('updateAllKingsAllies') !== -1, 'queueNames lists updateAllKingsAllies');
      try {
        Queues.pauseAll(false);
        equal(pausedQueues().length, Queues.queueNames.length, 'every queue paused');
        var settings = settingsDoc();
        equal(settings.isPaused, true, 'isPaused');
        equal(settings.manualPause, false, 'server pause is not manual');
        assert(settings.pausedAt && Date.now() - settings.pausedAt.getTime() < 60000, 'pausedAt is now');

        Queues.resumeAll();
        equal(pausedQueues().length, 0, 'no queue paused');
        settings = settingsDoc();
        equal(settings.isPaused, false, 'isPaused cleared');
        equal(settings.pausedAt, undefined, 'pausedAt cleared');
        equal(settings.manualPause, undefined, 'manualPause cleared');
      } finally {
        ensureResumed();
      }
    });

    run('pauseJobQueue from the admin panel is a manual pause, from server code it is not', function() {
      var admin = t.createTestUser({admin: true});
      var player = t.createTestUser();
      function callAs(userId, method) {
        var inv = {userId: userId, connection: {id: 'perfFixTests'}, isSimulation: false, unblock: function() {}, setUserId: function() {}};
        return DDP._CurrentInvocation.withValue(inv, function() {
          return Meteor.server.method_handlers[method].apply(inv, []);
        });
      }
      try {
        Meteor.call('pauseJobQueue');
        equal(settingsDoc().manualPause, false, 'server call is not manual');
        Meteor.call('resumeJobQueue');

        callAs(admin._id, 'pauseJobQueue');
        equal(settingsDoc().manualPause, true, 'admin panel call is manual');
        callAs(admin._id, 'resumeJobQueue');
        equal(settingsDoc().isPaused, false, 'admin resume works');

        var refused = false;
        try {
          callAs(player._id, 'pauseJobQueue');
        } catch (e) {
          refused = e.error == 'not-authorized';
        }
        assert(refused, 'a non-admin player is still refused');
        equal(pausedQueues().length, 0, 'refused call paused nothing');
      } finally {
        ensureResumed();
        t.cleanupUser(admin._id);
        t.cleanupUser(player._id);
      }
    });

    run('pauseAll that fails on one queue resumes everything and throws', function() {
      var queue = testQueue();
      var restores = [
        stub(queue, 'pause', function() { return Promise.reject(new Error('redis down')); }),
        stub(console, 'error', function() {})
      ];
      var threw = null;
      try {
        try {
          Queues.pauseAll(false);
        } catch (e) {
          threw = e;
        }
        restoreAll(restores);
        restores = [];
        assert(threw && threw.error === 'pause-failed', 'threw pause-failed, got ' + (threw && (threw.error || threw.message)));
        assert(threw.reason.indexOf('perfFixTestQueue') !== -1, 'names the failing queue');
        equal(pausedQueues().length, 0, 'nothing left paused');
        equal(settingsDoc().isPaused, false, 'isPaused cleared');
      } finally {
        restoreAll(restores);
        ensureResumed();
      }
    });

    run('resumeAll that fails on one queue still resumes the others, keeps isPaused and throws', function() {
      var queue = testQueue();
      var restores = [];
      var threw = null;
      try {
        Queues.pauseAll(false);
        restores.push(stub(queue, 'resume', function() { return Promise.reject(new Error('redis down')); }));
        restores.push(stub(console, 'error', function() {}));
        try {
          Queues.resumeAll();
        } catch (e) {
          threw = e;
        }
        assert(threw && threw.error === 'resume-failed', 'threw resume-failed, got ' + (threw && (threw.error || threw.message)));
        sameList(pausedQueues(), ['perfFixTestQueue'], 'only the failing queue is still paused');
        equal(settingsDoc().isPaused, true, 'isPaused kept so the safety net retries');

        restoreAll(restores);
        restores = [];
        Queues.resumeAll();
        equal(pausedQueues().length, 0, 'second resume clears it');
      } finally {
        restoreAll(restores);
        ensureResumed();
      }
    });

    function sameList(actual, expected, message) {
      equal(JSON.stringify(actual.slice().sort()), JSON.stringify(expected.slice().sort()), message);
    }

    run('resumeIfStuck leaves a running queue and a recent server pause alone', function() {
      var restores = [stub(console, 'error', function() {})];
      try {
        Settings.upsert({}, {$set: {isPaused: false}, $unset: {pausedAt: '', manualPause: ''}});
        equal(Queues.resumeIfStuck(), false, 'not paused');

        Queues.pauseAll(false);
        var later = new Date(Date.now() + Queues.stuckPauseMaxMs - 60000);
        equal(Queues.resumeIfStuck(later), false, 'paused for less than the limit');
        equal(pausedQueues().length, Queues.queueNames.length, 'still paused');
      } finally {
        restoreAll(restores);
        ensureResumed();
      }
    });

    run('resumeIfStuck resumes a server pause older than the limit', function() {
      var restores = [stub(console, 'error', function() {})];
      try {
        Queues.pauseAll(false);
        var later = new Date(Date.now() + Queues.stuckPauseMaxMs + 60000);
        equal(Queues.resumeIfStuck(later), true, 'resumed');
        equal(pausedQueues().length, 0, 'no queue paused');
        equal(settingsDoc().isPaused, false, 'isPaused cleared');
      } finally {
        restoreAll(restores);
        ensureResumed();
      }
    });

    run('resumeIfStuck never resumes a pause made from the admin panel', function() {
      var restores = [stub(console, 'error', function() {})];
      try {
        Queues.pauseAll(true);
        var muchLater = new Date(Date.now() + 1000*60*60*24);
        equal(Queues.resumeIfStuck(muchLater), false, 'left alone');
        equal(pausedQueues().length, Queues.queueNames.length, 'still paused');
      } finally {
        restoreAll(restores);
        ensureResumed();
      }
    });

    run('resumeIfStuck resumes a pause with no pausedAt (left by the old code)', function() {
      var restores = [stub(console, 'error', function() {})];
      try {
        Settings.upsert({}, {$set: {isPaused: true}, $unset: {pausedAt: '', manualPause: ''}});
        equal(Queues.resumeIfStuck(), true, 'resumed');
        equal(settingsDoc().isPaused, false, 'isPaused cleared');
      } finally {
        restoreAll(restores);
        ensureResumed();
      }
    });

    // stubs for dInit.updateAllKingsAlliesJob; records what ran and whether the
    // queues were paused at that moment
    function stubRebuild(failFor) {
      var log = {rebuilt: [], dominus: [], chatrooms: [], pausedDuringRebuild: [], pauses: 0, resumes: 0};
      var realPause = Queues.pauseAll;
      var realResume = Queues.resumeAll;
      var restores = [
        stub(dInit, 'updateAllKingsAlliesWaitMs', 0),
        stub(Queues, 'pauseAll', function(isManual) { log.pauses++; return realPause(isManual); }),
        stub(Queues, 'resumeAll', function() { log.resumes++; return realResume(); }),
        stub(dInit, 'rebuildRelationships', function(gameId) {
          log.pausedDuringRebuild.push(settingsDoc().isPaused === true);
          if (failFor && failFor.indexOf(gameId) !== -1) {
            throw new Error('rebuild failed for ' + gameId);
          }
          log.rebuilt.push(gameId);
        }),
        stub(dManager, 'checkForDominus', function(gameId) { log.dominus.push(gameId); }),
        stub(Queues, 'add', function(jobName, data) {
          if (jobName == 'cleanupAllKingChatrooms') log.chatrooms.push(data.gameId);
        }),
        stub(console, 'error', function() {})
      ];
      log.restore = function() { restoreAll(restores); };
      return log;
    }

    run('updateAllKingsAlliesJob pauses once for every running game and resumes', function() {
      var games = [0, 1, 2].map(function() { return t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()}); });
      var ids = games.map(function(g) { return g._id; });
      var log = stubRebuild();
      try {
        dInit.updateAllKingsAlliesJob();
        log.restore();

        ids.forEach(function(id) {
          assert(log.rebuilt.indexOf(id) !== -1, 'rebuilt ' + id);
          assert(log.dominus.indexOf(id) !== -1, 'checkForDominus ' + id);
          assert(log.chatrooms.indexOf(id) !== -1, 'chatroom cleanup queued ' + id);
        });
        equal(log.pauses, 1, 'paused once');
        equal(log.resumes, 1, 'resumed once');
        assert(log.pausedDuringRebuild.every(function(p) { return p; }), 'every rebuild ran while paused');
        equal(pausedQueues().length, 0, 'nothing left paused');
      } finally {
        log.restore();
        ensureResumed();
        ids.forEach(function(id) { t.cleanup(id); });
      }
    });

    run('updateAllKingsAlliesJob skips ended and unstarted games', function() {
      var running = t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()});
      var ended = t.createTestGame({hasStarted: true, hasEnded: true, startedAt: new Date()});
      var notStarted = t.createTestGame({hasStarted: false, hasEnded: false});
      var log = stubRebuild();
      try {
        dInit.updateAllKingsAlliesJob();
        log.restore();
        assert(log.rebuilt.indexOf(running._id) !== -1, 'running game rebuilt');
        equal(log.rebuilt.indexOf(ended._id), -1, 'ended game skipped');
        equal(log.rebuilt.indexOf(notStarted._id), -1, 'unstarted game skipped');
      } finally {
        log.restore();
        ensureResumed();
        [running, ended, notStarted].forEach(function(g) { t.cleanup(g._id); });
      }
    });

    run('updateAllKingsAlliesJob with a gameId rebuilds only that game', function() {
      var a = t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()});
      var b = t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()});
      var log = stubRebuild();
      try {
        dInit.updateAllKingsAlliesJob(a._id);
        log.restore();
        sameList(log.rebuilt, [a._id], 'only game a');
        equal(log.pauses, 1, 'paused once');
        equal(log.resumes, 1, 'resumed once');
      } finally {
        log.restore();
        ensureResumed();
        t.cleanup(a._id);
        t.cleanup(b._id);
      }
    });

    run('updateAllKingsAlliesJob: one game failing does not stop the others or leave the queues paused', function() {
      var games = [0, 1, 2].map(function() { return t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()}); });
      var ids = games.map(function(g) { return g._id; });
      var log = stubRebuild([ids[1]]);
      try {
        dInit.updateAllKingsAlliesJob();
        log.restore();
        assert(log.rebuilt.indexOf(ids[0]) !== -1, 'game before the failure rebuilt');
        assert(log.rebuilt.indexOf(ids[2]) !== -1, 'game after the failure rebuilt');
        equal(log.dominus.indexOf(ids[1]), -1, 'failed game skips checkForDominus');
        equal(log.resumes, 1, 'resumed');
        equal(pausedQueues().length, 0, 'nothing left paused');
        equal(settingsDoc().isPaused, false, 'isPaused cleared');
      } finally {
        log.restore();
        ensureResumed();
        ids.forEach(function(id) { t.cleanup(id); });
      }
    });

    run('updateAllKingsAlliesJob resumes the queues even when the job itself throws', function() {
      var game = t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()});
      var log = stubRebuild();
      var restoreSleep = stub(Meteor, '_sleepForMs', function() { throw new Error('boom'); });
      var threw = false;
      try {
        try {
          dInit.updateAllKingsAlliesJob(game._id);
        } catch (e) {
          threw = true;
        }
        restoreSleep();
        log.restore();
        assert(threw, 'the error still reaches Bull');
        equal(log.resumes, 1, 'resumed');
        equal(pausedQueues().length, 0, 'nothing left paused');
      } finally {
        restoreSleep();
        log.restore();
        ensureResumed();
        t.cleanup(game._id);
      }
    });

    run('the midnight cron queues one updateAllKingsAllies job for all games', function() {
      if (!isWorker || !SyncedCron._entries || !SyncedCron._entries['midnight job']) return 'skip';
      var game = t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()});
      var calls = [];
      var restore = stub(Queues, 'add', function(jobName, data, options, uniqueId) {
        calls.push({jobName: jobName, data: data, options: options, uniqueId: uniqueId});
      });
      try {
        SyncedCron._entries['midnight job'].job();
        restore();
        var rebuilds = calls.filter(function(c) { return c.jobName == 'updateAllKingsAllies'; });
        equal(rebuilds.length, 1, 'one job');
        equal(rebuilds[0].data.gameId, undefined, 'no gameId, so it covers every game');
        equal(rebuilds[0].uniqueId, 'allGames', 'deduped');
        equal(rebuilds[0].options.attempts, undefined, 'no retries');
        assert(calls.some(function(c) { return c.jobName == 'dailystatsNumVassalsEveryone' && c.data.gameId == game._id; }), 'per-game dailystats job still queued');
      } finally {
        restore();
        t.cleanup(game._id);
      }
    });

    run('observation: Bull counts a fiber-wrapped job as done before its work finishes', function() {
      // Documents why shutdown waits a fixed grace period instead of relying on
      // Bull. If this fails, Bull does wait for fiber work and shutdown could
      // exit sooner -- nothing is broken either way.
      if (!isWorker) return 'skip';
      if (!Queues.perfFixFiberQueue) {
        Queues.create('perfFixFiberQueue');
        Queues.perfFixFiberQueue.process(Meteor.bindEnvironment(function(job) {
          Meteor._sleepForMs(1500);
          perfFixFiberDone = true;
          return Promise.resolve();
        }));
      }
      perfFixFiberDone = false;
      var doneAtCompletion = null;
      var listener = function() { doneAtCompletion = perfFixFiberDone; };
      Queues.perfFixFiberQueue.once('completed', listener);
      Queues.perfFixFiberQueue.add({});
      assert(waitFor(function() { return doneAtCompletion !== null; }, 10000), 'job completed');
      equal(doneAtCompletion, false, 'work still running when Bull reported completion');
      assert(waitFor(function() { return perfFixFiberDone; }, 5000), 'work finished afterwards');
    });


    // --- #3 Indexes (packages/dominus-collections/indexes.js) ---

    function indexNames(collection) {
      return awaitPromise(collection.rawCollection().indexes()).map(function(index) { return index.name; });
    }

    // stage names and index names of the winning plan
    function plan(collection, selector, options) {
      var cursor = collection.rawCollection().find(selector, options || {});
      var explain = awaitPromise(cursor.explain());
      var winning = explain.queryPlanner.winningPlan;
      winning = winning.queryPlan || winning;  // MongoDB 7+ (SBE) nests it
      var stages = [];
      var indexes = [];
      (function walk(node) {
        if (!node) return;
        stages.push(node.stage);
        if (node.indexName) indexes.push(node.indexName);
        walk(node.inputStage);
        (node.inputStages || []).forEach(walk);
      })(winning);
      return {stages: stages, indexes: indexes};
    }

    run('index: the four new indexes exist', function() {
      assert(indexNames(Players).indexOf('userId_1') !== -1, 'Players userId_1');
      assert(indexNames(Alerts).indexOf('playerIds.playerId_1_created_at_-1') !== -1, 'Alerts playerId + created_at');
      assert(indexNames(Alerts).indexOf('playerIds.playerId_1_playerIds.read_1') !== -1, 'Alerts playerId + read');
      assert(indexNames(Markers).indexOf('unitId_1_unitType_1') !== -1, 'Markers unitId + unitType');
    });

    run('index: player lookups by userId use userId_1; by game and user still use gameId_1_userId_1', function() {
      var game = t.createTestGame();
      var userId = 'u_' + Random.id(5);
      try {
        Players.insert({gameId: game._id, userId: userId, gameIsClosed: false, gameIsOver: false});
        var topNav = plan(Players, {userId: userId, gameIsClosed: false}, {projection: {gameId: 1, gameName: 1}});
        assert(topNav.indexes.indexOf('userId_1') !== -1, 'top nav uses userId_1: ' + topNav.stages.join('>'));
        var profile = plan(Players, {userId: userId, gameIsOver: true});
        assert(profile.indexes.indexOf('userId_1') !== -1, 'profile uses userId_1: ' + profile.stages.join('>'));
        var settings = plan(Players, {userId: userId});
        assert(settings.indexes.indexOf('userId_1') !== -1, 'settings uses userId_1');
        var inGame = plan(Players, {gameId: game._id, userId: userId});
        assert(inGame.indexes.indexOf('gameId_1_userId_1') !== -1, 'in-game lookup keeps gameId_1_userId_1: ' + inGame.indexes.join(','));
      } finally {
        t.cleanup(game._id);
      }
    });

    run('index: myAlerts uses the new alerts index with no in-memory sort', function() {
      var game = t.createTestGame();
      var pid = 'p_' + Random.id(5);
      try {
        for (var i = 0; i < 5; i++) {
          Alerts.insert({gameId: game._id, created_at: new Date(Date.now() - i * 1000), type: 't' + i, vars: {},
            playerIds: [{playerId: pid, read: i % 2 == 0}, {playerId: 'other', read: false}]});
        }
        var p = plan(Alerts, {playerIds: {$elemMatch: {playerId: pid}}, type: {$nin: ['t1']}}, {sort: {created_at: -1}, limit: 150});
        assert(p.indexes.indexOf('playerIds.playerId_1_created_at_-1') !== -1, 'uses playerId + created_at: ' + p.indexes.join(','));
        equal(p.stages.indexOf('SORT'), -1, 'no SORT stage');

        var docs = Alerts.find({playerIds: {$elemMatch: {playerId: pid}}, type: {$nin: ['t1']}}, {sort: {created_at: -1}, limit: 150}).fetch();
        equal(docs.length, 4, 'four alerts, t1 hidden');
        assert(docs.every(function(d, i) { return i == 0 || docs[i - 1].created_at >= d.created_at; }), 'newest first');
      } finally {
        Alerts.remove({gameId: game._id});
        t.cleanup(game._id);
      }
    });

    run('index: unreadAlerts and the mark-read updates use an index', function() {
      var game = t.createTestGame();
      var pid = 'p_' + Random.id(5);
      try {
        Alerts.insert({gameId: game._id, created_at: new Date(), type: 't', vars: {}, playerIds: [{playerId: pid, read: false}]});
        var unread = plan(Alerts, {playerIds: {$elemMatch: {playerId: pid, read: false}}, type: {$nin: []}}, {projection: {_id: 1}});
        equal(unread.stages.indexOf('COLLSCAN'), -1, 'unreadAlerts: no COLLSCAN');
        var markAll = plan(Alerts, {'playerIds.playerId': pid});
        equal(markAll.stages.indexOf('COLLSCAN'), -1, 'markAllAlertsAsRead: no COLLSCAN');
      } finally {
        Alerts.remove({gameId: game._id});
        t.cleanup(game._id);
      }
    });

    run('index: army marker updates and removals use unitId_1_unitType_1', function() {
      var game = t.createTestGame();
      try {
        Markers.insert({gameId: game._id, unitType: 'army', unitId: 'army_' + Random.id(5), user_id: 'u', playerId: 'p'});
        var p = plan(Markers, {unitType: 'army', unitId: 'someArmy'});
        assert(p.indexes.indexOf('unitId_1_unitType_1') !== -1, 'uses unitId_1_unitType_1: ' + p.stages.join('>'));
        var withUser = plan(Markers, {unitType: 'army', unitId: 'someArmy', user_id: 'u'});
        equal(withUser.stages.indexOf('COLLSCAN'), -1, 'addMarker check: no COLLSCAN');
        var publish = plan(Markers, {playerId: 'p', user_id: 'u'});
        assert(publish.indexes.indexOf('playerId_1_user_id_1') !== -1, 'markers publication keeps playerId_1_user_id_1');
      } finally {
        Markers.remove({gameId: game._id});
        t.cleanup(game._id);
      }
    });


    // --- #4 Lookups by coordinates are scoped to the game (coords_to_id,
    //        dInit.attackCreatesLoop) ---

    function callMethod(userId, method, args) {
      var inv = {userId: userId, connection: {id: 'perfFixTests'}, isSimulation: false, unblock: function() {}, setUserId: function() {}};
      return DDP._CurrentInvocation.withValue(inv, function() {
        return Meteor.server.method_handlers[method].apply(inv, args);
      });
    }

    function cleanupMap(gameId) {
      Hexes.remove({gameId: gameId});
      Castles.remove({gameId: gameId});
      Armies.remove({gameId: gameId});
      t.cleanup(gameId);
    }

    run('gameId: coords_to_id only finds hexes in the game it is asked about', function() {
      var a = t.createTestGame();
      var b = t.createTestGame();
      var user = t.createTestUser();
      try {
        var aHex = Hexes.insert({gameId: a._id, x: 1, y: 1});
        var bHex = Hexes.insert({gameId: b._id, x: 3, y: -5});
        var aShared = Hexes.insert({gameId: a._id, x: 7, y: 7});
        var bShared = Hexes.insert({gameId: b._id, x: 7, y: 7});

        equal(callMethod(user._id, 'coords_to_id', [a._id, 1, 1, 'hex']), aHex, 'own hex found');
        equal(callMethod(user._id, 'coords_to_id', [a._id, 3, -5, 'hex']), false, 'hex that only exists in another game is not found');
        equal(callMethod(user._id, 'coords_to_id', [b._id, 3, -5, 'hex']), bHex, 'found in its own game');
        equal(callMethod(user._id, 'coords_to_id', [a._id, 7, 7, 'hex']), aShared, 'shared coordinates: game a gets its own hex');
        equal(callMethod(user._id, 'coords_to_id', [b._id, 7, 7, 'hex']), bShared, 'shared coordinates: game b gets its own hex');
      } finally {
        cleanupMap(a._id);
        cleanupMap(b._id);
        t.cleanupUser(user._id);
      }
    });

    run('gameId: coords_to_id refuses the old call without a gameId; doesHexExist is gone', function() {
      var user = t.createTestUser();
      try {
        var refused = false;
        try {
          callMethod(user._id, 'coords_to_id', [3, -5, 'hex']);
        } catch (e) {
          refused = true;
        }
        assert(refused, 'old signature is refused');
        equal(Meteor.server.method_handlers['doesHexExist'], undefined, 'doesHexExist removed');
      } finally {
        t.cleanupUser(user._id);
      }
    });

    // a lord/vassal capture loop: castle owner A has an army on B's castle and
    // B has an army on A's castle
    function makeLoop(gameId, ax, ay, bx, by) {
      var a = 'pa_' + Random.id(5);
      var b = 'pb_' + Random.id(5);
      Castles.insert({gameId: gameId, playerId: a, x: ax, y: ay});
      Castles.insert({gameId: gameId, playerId: b, x: bx, y: by});
      Armies.insert({gameId: gameId, playerId: b, x: ax, y: ay, speed: 1});
      Armies.insert({gameId: gameId, playerId: a, x: bx, y: by, speed: 1});
      return {a: a, b: b};
    }

    run('gameId: attackCreatesLoop still finds a loop inside one game', function() {
      var game = t.createTestGame();
      try {
        makeLoop(game._id, 5, 5, 9, 9);
        equal(dInit.attackCreatesLoop(game._id, 5, 5), true, 'loop at the first castle');
        equal(dInit.attackCreatesLoop(game._id, 9, 9), true, 'loop at the second castle');
      } finally {
        cleanupMap(game._id);
      }
    });

    run('gameId: attackCreatesLoop is false when there is no loop', function() {
      var game = t.createTestGame();
      try {
        var a = 'pa_' + Random.id(5);
        var b = 'pb_' + Random.id(5);
        Castles.insert({gameId: game._id, playerId: a, x: 5, y: 5});
        Castles.insert({gameId: game._id, playerId: b, x: 9, y: 9});
        Armies.insert({gameId: game._id, playerId: b, x: 5, y: 5, speed: 1});
        equal(dInit.attackCreatesLoop(game._id, 5, 5), false, 'one-sided attack is not a loop');
        equal(dInit.attackCreatesLoop(game._id, 1, 1), false, 'no castle there');
      } finally {
        cleanupMap(game._id);
      }
    });

    run('gameId: a loop in another game at the same coordinates does not block this game', function() {
      var looped = t.createTestGame();
      var other = t.createTestGame();
      try {
        makeLoop(looped._id, 5, 5, 9, 9);
        // other game: a plain attack on a castle at the same coordinates
        var a = 'pa_' + Random.id(5);
        var b = 'pb_' + Random.id(5);
        Castles.insert({gameId: other._id, playerId: a, x: 5, y: 5});
        Castles.insert({gameId: other._id, playerId: b, x: 9, y: 9});
        Armies.insert({gameId: other._id, playerId: b, x: 5, y: 5, speed: 1});

        equal(dInit.attackCreatesLoop(other._id, 5, 5), false, 'the other game can attack');
        equal(dInit.attackCreatesLoop(looped._id, 5, 5), true, 'the looped game still sees its loop');
      } finally {
        cleanupMap(looped._id);
        cleanupMap(other._id);
      }
    });

    run('gameId: armies in another game do not create a loop in this one', function() {
      var game = t.createTestGame();
      var other = t.createTestGame();
      try {
        var a = 'pa_' + Random.id(5);
        Castles.insert({gameId: game._id, playerId: a, x: 5, y: 5});
        // the other game has a full loop through the same coordinates
        makeLoop(other._id, 5, 5, 9, 9);
        equal(dInit.attackCreatesLoop(game._id, 5, 5), false, 'no army of this game is here');
      } finally {
        cleanupMap(game._id);
        cleanupMap(other._id);
      }
    });

  };
}
