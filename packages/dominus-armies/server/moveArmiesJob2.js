var Future = Npm.require('fibers/future');

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.moveArmiesJob.process(Meteor.bindEnvironment(function(job) {
    dArmies.moveArmiesJob();
    return Promise.resolve();
  }));
}




if (process.env.DOMINUS_WORKER == 'true') {
  Queues.fixPathIndexes.process(Meteor.bindEnvironment(function(job) {
    dArmies.fixPathIndexes(job.data.armyId);
    return Promise.resolve();
  }));
}

// re-number army path indexes
dArmies.fixPathIndexes = function(armyId) {
  check(armyId, String);

  let bulkPaths = Armypaths.rawCollection().initializeUnorderedBulkOp();
  let hasBulk = false;

  var index = 0;
  var find = {armyId:armyId};
  var options = {sort:{index:1}};
  Armypaths.find(find, options).forEach(function(path) {
    bulkPaths.find({_id:path._id}).updateOne({$set: {index:index, countryIds:null, hexes:null}});
    index++;
    hasBulk = true;
  });

  if (hasBulk) {
    let futurePaths = new Future();
    bulkPaths.execute({}, function(error, result) {
      if (error) {
        console.error(error);
      }
      futurePaths.return(result);
    });
    futurePaths.wait();
  }
}



// TODO: use find and modify
// hexes is sometimes null by the time we do $pop
dArmies.moveArmiesJob = function(done) {

  Armypaths.find({index:0, paused:false, speed:{$ne:null}, hexes:{$ne:null, $exists:true}}).forEach(function(path) {

    if (moment(new Date(path.last_move_at)).add(path.speed, 'minutes') < moment()) {
      if (path.hexes) {
        if (path.hexes.length > 0) {

          let bulkPaths = Armypaths.rawCollection().initializeOrderedBulkOp();
          let hasBulk = false;

          var hex = path.hexes[0];

          let distance = path.hexes.length-1;
          var timeInMinutes = path.speed * distance;
          var time = timeInMinutes * 60 * 1000; // convert to ms

          Armypaths.update(path._id, {$pop: {hexes:-1}, $set: {distance:distance, time:time}});
          //bulkPaths.find({_id:path._id}).updateOne({$pop: {hexes:-1}, $set: {distance:distance, time:time}});

          // check if we're at the end
          if (path.hexes.length == 1) {

            // are we at end?
            if (hex.x == path.x && hex.y == path.y) {
              // path finished
              // remove and update index
              Armypaths.remove(path._id);
              //bulkPaths.find({_id:path._id}).remove();


              var index = 0;
              var find = {armyId:path.armyId};
              Armypaths.find(find, {sort:{index:1}}).forEach(function(p) {
                //Armypaths.update(p._id, {$set:{index:index}});
                bulkPaths.find({_id:p._id}).updateOne({$set:{index:index}});
                hasBulk = true;
                index++;
              });
            }
          }

          if (hasBulk) {
            let futurePaths = new Future();
            bulkPaths.execute({}, function(error, result) {
              if (error) {
                console.error(error);
              }
              futurePaths.return(result);
            });
            futurePaths.wait();
          }

          // move army after fixing paths
          Armies.update(path.armyId, {$set: {
            x:hex.x,
            y:hex.y,
            last_move_at:new Date(),
            countryId: hex.countryId
          }, $inc: {moveDistance:-1}});

          Armypaths.update({armyId:path.armyId}, {$set:{last_move_at:new Date()}}, {multi:true});
          //bulkPaths.find({armyId:path.armyId}).update({$set:{last_move_at:new Date()}});

          // markers
          Markers.update({unitType:'army', unitId:path.armyId}, {$set:{
            x:hex.x,
            y:hex.y,
            countryId: hex.countryId
          }}, {multi:true});
          //bulkMarkers.find({unitId:path.armyId}).updateOne({$set:{x:hex.x, y:hex.y, countryId: hex.countryId}});

          dArmies.enterNewHexCheck(path.gameId, path.armyId, true);

        } else {

          let bulkPaths = Armypaths.rawCollection().initializeOrderedBulkOp();

          // path.length == 0
          // remove and update index
          //Armypaths.remove(path._id);
          //bulkPaths.find({_id:path._id}).remove();
          bulkPaths.find({_id:path._id}).deleteOne();

          var index = 0;
          var find = {armyId:path.armyId};
          Armypaths.find(find, {sort:{index:1}}).forEach(function(p) {
            //Armypaths.update(p._id, {$set:{index:index}});
            bulkPaths.find({_id:p._id}).updateOne({$set:{index:index}});
            index++;
          });

          let futurePaths = new Future();
          bulkPaths.execute({}, function(error, result) {
            if (error) {
              console.error(error);
            }
            futurePaths.return(result);
          });
          futurePaths.wait();

        }
      }
    }
  });
}
