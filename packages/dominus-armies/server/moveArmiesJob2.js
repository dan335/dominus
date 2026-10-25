if (process.env.DOMINUS_WORKER == 'true') {
  Queues.moveArmiesJob.process(async function(job) {
    await dArmies.moveArmiesJob();
  });
}




if (process.env.DOMINUS_WORKER == 'true') {
  Queues.fixPathIndexes.process(async function(job) {
    await dArmies.fixPathIndexes(job.data.armyId);
  });
}

// runs a bulk op, logging a failure as the callbacks this replaces did
var executeBulk = async function(bulk) {
  try {
    await bulk.execute();
  } catch (error) {
    console.error(error);
  }
};

// re-number army path indexes
dArmies.fixPathIndexes = async function(armyId) {
  check(armyId, String);

  let bulkPaths = Armypaths.rawCollection().initializeUnorderedBulkOp();
  let hasBulk = false;

  var index = 0;
  var find = {armyId:armyId};
  var options = {sort:{index:1}};
  for (const path of await Armypaths.find(find, options).fetchAsync()) {
    bulkPaths.find({_id:path._id}).updateOne({$set: {index:index, countryIds:null, hexes:null}});
    index++;
    hasBulk = true;
  }

  if (hasBulk) {
    await executeBulk(bulkPaths);
  }
}



// TODO: use find and modify
// hexes is sometimes null by the time we do $pop
dArmies.moveArmiesJob = async function(done) {

  for (const path of await Armypaths.find({index:0, paused:false, speed:{$ne:null}, hexes:{$ne:null, $exists:true}}).fetchAsync()) {

    if (moment(new Date(path.last_move_at)).add(path.speed, 'minutes') < moment(dClock.now())) {
      if (path.hexes) {
        if (path.hexes.length > 0) {

          let bulkPaths = Armypaths.rawCollection().initializeOrderedBulkOp();
          let hasBulk = false;

          var hex = path.hexes[0];

          // Guard against the read-then-pop race that teleports armies. This
          // loop iterates a cursor snapshot that can be seconds old; if an
          // overlapping moveArmiesJob (jobs are enqueued every ~5s with no
          // uniqueId, and a stalled job can be reprocessed) already advanced
          // this path, popping based on the stale snapshot skips a hex and jumps
          // the army to a non-adjacent hex. Re-read the path fresh and skip this
          // tick unless it still matches the snapshot, so we only pop from
          // current data. Worst case an army waits one tick -- never a teleport.
          var freshPath = await Armypaths.findOneAsync(path._id, {fields: {hexes:1}});
          if (!freshPath || !freshPath.hexes || freshPath.hexes.length !== path.hexes.length ||
              freshPath.hexes[0].x !== hex.x || freshPath.hexes[0].y !== hex.y) {
            continue;
          }

          let distance = path.hexes.length-1;
          var timeInMinutes = path.speed * distance;
          var time = timeInMinutes * 60 * 1000; // convert to ms

          await Armypaths.updateAsync(path._id, {$pop: {hexes:-1}, $set: {distance:distance, time:time}});
          //bulkPaths.find({_id:path._id}).updateOne({$pop: {hexes:-1}, $set: {distance:distance, time:time}});

          // check if we're at the end
          if (path.hexes.length == 1) {

            // are we at end?
            if (hex.x == path.x && hex.y == path.y) {
              // path finished
              // remove and update index
              await Armypaths.removeAsync(path._id);
              //bulkPaths.find({_id:path._id}).remove();


              var index = 0;
              var find = {armyId:path.armyId};
              for (const p of await Armypaths.find(find, {sort:{index:1}}).fetchAsync()) {
                //Armypaths.update(p._id, {$set:{index:index}});
                bulkPaths.find({_id:p._id}).updateOne({$set:{index:index}});
                hasBulk = true;
                index++;
              }
            }
          }

          if (hasBulk) {
            await executeBulk(bulkPaths);
          }

          // move army after fixing paths
          await Armies.updateAsync(path.armyId, {$set: {
            x:hex.x,
            y:hex.y,
            last_move_at:dClock.now(),
            countryId: hex.countryId
          }, $inc: {moveDistance:-1}});

          await Armypaths.updateAsync({armyId:path.armyId}, {$set:{last_move_at:dClock.now()}}, {multi:true});
          //bulkPaths.find({armyId:path.armyId}).update({$set:{last_move_at:new Date()}});

          // markers
          await Markers.updateAsync({unitType:'army', unitId:path.armyId}, {$set:{
            x:hex.x,
            y:hex.y,
            countryId: hex.countryId
          }}, {multi:true});
          //bulkMarkers.find({unitId:path.armyId}).updateOne({$set:{x:hex.x, y:hex.y, countryId: hex.countryId}});

          await dArmies.enterNewHexCheck(path.gameId, path.armyId, true);

        } else {

          let bulkPaths = Armypaths.rawCollection().initializeOrderedBulkOp();

          // path.length == 0
          // remove and update index
          //Armypaths.remove(path._id);
          //bulkPaths.find({_id:path._id}).remove();
          bulkPaths.find({_id:path._id}).deleteOne();

          var index = 0;
          var find = {armyId:path.armyId};
          for (const p of await Armypaths.find(find, {sort:{index:1}}).fetchAsync()) {
            //Armypaths.update(p._id, {$set:{index:index}});
            bulkPaths.find({_id:p._id}).updateOne({$set:{index:index}});
            index++;
          }

          await executeBulk(bulkPaths);

        }
      }
    }
  }
}
