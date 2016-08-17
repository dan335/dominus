if (process.env.DOMINUS_WORKER == 'true') {
  Queues.updatePathTime.process(4, Meteor.bindEnvironment(function(job) {
    check(job.data.path.speed, validNumber);
    check(job.data.path.distance, validNumber);
    check(job.data.path._id, String);
    check(job.data.path.armyId, String);

    let timeInMinutes = job.data.path.speed * job.data.path.distance;
    let time = timeInMinutes * 60 * 1000; // convert to ms
    Armypaths.update(job.data.path._id, {$set: {time:time, dirtyMoveTotals:true}});
    return Promise.resolve();
  }));


  Queues.updateArmyMoveTotals.process(4, Meteor.bindEnvironment(function(job) {
    check(job.data.armyId, String);

    let time = 0;
    let distance = 0;
    Armypaths.find({armyId:job.data.armyId}, {fields: {time:1, distance:1}}).forEach(function(path) {
      if (path.time) {
        time += path.time;
      }
      if (path.distance) {
        distance += path.distance;
      }
      Armypaths.update(path._id, {$set: {dirtyMoveTotals:false}});
    });

    Armies.update(job.data.armyId, {$set: {moveTime:time, moveDistance:distance}});
    return Promise.resolve();
  }));


  Queues.updateMoveSpeed.process(4, Meteor.bindEnvironment(function(job) {
    check(job.data.army.gameId, String);
    check(job.data.army._id, String);

    var speed = dArmies.speed(job.data.army.gameId, job.data.army);
    Armies.update(job.data.army._id, {$set:{speed:speed}});
    Armypaths.update({armyId:job.data.army._id}, {$set:{speed:speed, time:null}}, {multi:true});
    return Promise.resolve();
  }));
}
