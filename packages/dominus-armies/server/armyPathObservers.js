if (process.env.DOMINUS_WORKER == 'true') {
  Queues.updatePathTime.process(4, async function(job) {
    check(job.data.path.speed, validNumber);
    check(job.data.path.distance, validNumber);
    check(job.data.path._id, String);
    check(job.data.path.armyId, String);

    let timeInMinutes = job.data.path.speed * job.data.path.distance;
    let time = timeInMinutes * 60 * 1000; // convert to ms
    await Armypaths.updateAsync(job.data.path._id, {$set: {time:time, dirtyMoveTotals:true}});
  });


  Queues.updateArmyMoveTotals.process(4, async function(job) {
    check(job.data.armyId, String);

    let time = 0;
    let distance = 0;
    for (const path of await Armypaths.find({armyId:job.data.armyId}, {fields: {time:1, distance:1}}).fetchAsync()) {
      if (path.time) {
        time += path.time;
      }
      if (path.distance) {
        distance += path.distance;
      }
      await Armypaths.updateAsync(path._id, {$set: {dirtyMoveTotals:false}});
    }

    await Armies.updateAsync(job.data.armyId, {$set: {moveTime:time, moveDistance:distance}});
  });


  Queues.updateMoveSpeed.process(4, async function(job) {
    check(job.data.army.gameId, String);
    check(job.data.army._id, String);

    var speed = dArmies.speed(job.data.army.gameId, job.data.army);
    await Armies.updateAsync(job.data.army._id, {$set:{speed:speed}});
    await Armypaths.updateAsync({armyId:job.data.army._id}, {$set:{speed:speed, time:null}}, {multi:true});
  });
}
