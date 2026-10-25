dVillages = {};


dVillages.finishBuildingVillage = async function(villageId) {
  check(villageId, String);

  var options = {fields:{x:1, y:1, playerId:1}};
  var village = await Villages.findOneAsync(villageId, options);
  if (!village) {
    return false;
  }

  // if army is there merge them
  var armyOptions = {fields:{}};
  _s.armies.types.forEach(function(type) {
    armyOptions.fields[type] = 1;
  })
  for (const army of await Armies.find({x:village.x, y:village.y, playerId: village.playerId}, armyOptions).fetchAsync()) {
    if (dArmies.isStopped(army._id)) {

      var inc = {};
      _s.armies.types.forEach(function(type) {
        inc[type] = army[type];
      })

      await Villages.updateAsync(villageId, {$inc:inc})
      dArmies.destroyArmy(army._id);
    }
  }

  // increment level
  // remove under construction flag
  await Villages.updateAsync(villageId, {$set: {under_construction:false}, $inc: {level:1}});

  // #TODO:170 send notification
}







if (process.env.DOMINUS_WORKER == 'true') {
  Queues.villageConstructionJob.process(async function(job) {
    await dVillages.villageConstructionJob(job.data.gameId);
  });
}


dVillages.villageConstructionJob = async function(gameId) {
  var find = {under_construction:true, gameId:gameId};
  var options = {fields: {gameId:1, level:1, constructionStarted:1}};
	for (const village of await Villages.find(find, options).fetchAsync()) {
    let path = 'cost.level'+(village.level+1)+'.timeToBuild';
    let timeToBuild = _gs.villages(village.gameId, path);
		//var timeToBuild = _s.villages.cost['level'+(village.level+1)].timeToBuild;
		var finishAt = moment(new Date(village.constructionStarted)).add(timeToBuild, 'ms');
		if (moment(dClock.now()).isAfter(finishAt)) {
			await dVillages.finishBuildingVillage(village._id);
		}
	}
}



// Meteor.startup(function() {
//   if (process.env.DOMINUS_WORKER == 'true') {
//     Meteor.setInterval(function() {
//       Games.find({hasStarted:true, hasEnded:false}, {fields: {_id:1}}).forEach(function(game) {
//         Queues.add('villageConstructionJob', {gameId:game._id}, {delay:0, timeout:1000*60*5}, false);
//       });
//
//     }, _s.villages.constructionUpdateInterval);
//   }
// });
