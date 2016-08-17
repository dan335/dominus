

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.enterNewHexCheck.process(Meteor.bindEnvironment(function(job) {
    dArmies.enterNewHexCheck(job.data.gameId, job.data.armyId, job.data.checkForMerge);
    return Promise.resolve();
  }));
}



dArmies.create = function(playerId, soldiers, x, y, last_move_at) {
  var self = this;

  check(playerId, String);
  check(x, Match.Integer);
  check(y, Match.Integer);
  check(last_move_at, Match.OneOf(Date, undefined));

  // set last_move_at to now if not set
  last_move_at = typeof last_move_at !== 'undefined' ? last_move_at : new Date();

  var fields = {male:1, gameId:1, playerId:1, userId:1, username:1, x:1, y:1, allies_above:1, allies_below:1, castle_id:1, is_dominus:1};
  var player = Players.findOne(playerId, {fields:fields});

  var countryId = Mapmaker.coordsToCountryId(player.gameId, x, y);
  if (!countryId) {
    console.error('could not get country id in dArmies.create');
    return false;
  }

  var army = {
    gameId: player.gameId,
    playerId: player._id,
    name: self.createName(),
    x: x,
    y: y,
    created_at: new Date(),
    last_move_at: last_move_at,
    pastMoves: [{x:x, y:y, moveDate:new Date()}],
    user_id: player.userId,
    username: player.username,
    castle_x: player.x,
    castle_y: player.y,
    castle_id: player.castle_id,
    countryId: countryId,
    moveDistance: 0,   // total path distance, must be number because $inc is used
    moveTime: null,
    speed: null,
    male: player.male
  }

  _.each(_s.armies.types, function(type) {
    if (!soldiers[type]) {
      army[type] = 0;
    } else {
      if (isValidNumber(soldiers[type])) {
        army[type] = soldiers[type];
      } else {
        console.error('soldier count is not valid number');
        return false;
      }
    }
  });

  // make sure army isn't empty
  var num = 0;
  _s.armies.types.forEach(function(type) {
    num += army[type];
  });
  if (!num) {
    console.error('army is empty');
    return false;
  }

  army._id = Armies.insert(army);

  if (!army._id) {
    console.error('error inserting army');
    return false;
  }

  Queues.add('enterNewHexCheck', {gameId:player.gameId, armyId:army._id, checkForMerge:false}, {attempts:10, backoff:{type:'fixed', delay:3000}, delay:0, timeout:1000*60*5}, false);

  return army;
}




dArmies.isStopped = function(armyId) {
  check(armyId, String);

  return Armypaths.find({armyId:armyId}).count() == 0;
}


dArmies.enterNewHexCheck = function(gameId, army_id, checkForMerge) {
  check(army_id, String);
  check(checkForMerge, Boolean);
  check(gameId, String);

  var armyFields = {playerId:1, user_id:1, x:1, y:1, onAllyBuilding:1, pastMoves:1};
  _s.armies.types.forEach(function(type) {
    armyFields[type] = 1;
  })

  var army = Armies.findOne(army_id, {fields: armyFields});
  if (!army) {
    console.error('no army found in enterNewHexCheck');
    return false;
  }

  var armies = Armies.find({gameId:gameId, x:army.x, y:army.y}, {fields: armyFields});

  var capital = Capitals.findOne({gameId:gameId, x:army.x, y:army.y});

  var playerFields = {userId:1, gameId:1, is_dominus:1, team:1, lord:1, allies_above:1, allies_below:1, king:1, vassals:1};
  let player = Players.findOne(army.playerId, {fields:playerFields});
  if (!player) {
    console.error('no user found in enterNewHexCheck');
  }

  var castle = Castles.findOne({gameId:gameId, x:army.x, y:army.y}, {fields: {playerId:1}});
  var village = Villages.findOne({gameId:gameId, x:army.x, y:army.y}, {fields: {playerId:1}});
  var capital = Capitals.findOne({gameId:gameId, x:army.x, y:army.y}, {fields: {playerId:1}});

  if (castle) {
    var castleRelation = dInit.getPlayersRelationship(player, castle.playerId);
  }

  if (village) {
    var villageRelation = dInit.getPlayersRelationship(player, village.playerId);
  }

  // if is stopped
  if (checkForMerge && dArmies.isStopped(army_id)) {

    var hasMerged = false

    // for alerts
    var joinedCastle = null
    var joinedVillage = null
    var joinedArmy = null

    // merging
    var inc = {};
    _s.armies.types.forEach(function(type) {
      inc[type] = army[type]
    });

    // my castle
    if (castle && castleRelation == 'mine') {
      Castles.update(castle._id, {$inc:inc});
      dArmies.destroyArmy(army_id);
      hasMerged = true;
      joinedCastle = castle._id;
      Markers.remove({unitType:'army', unitId:army._id});
    }

    // my village
    if (!hasMerged && village && villageRelation == 'mine') {
      Villages.update(village._id, {$inc:inc});
      dArmies.destroyArmy(army_id);
      hasMerged = true;
      joinedVillage = village._id;
      Markers.remove({unitType:'army', unitId:army._id});
    }

    // my armies
    if (!hasMerged) {
      armies.forEach(function(otherArmy) {
        if (army._id != otherArmy._id) {
          if (!hasMerged) {

            var relation = dInit.getPlayersRelationship(player, otherArmy.playerId);
            if (relation == 'mine') {

              // make sure other army is stopped
              if (dArmies.isStopped(otherArmy._id)) {
                Armies.update(otherArmy._id, {$inc:inc, $set: {speed:null}});
                dArmies.destroyArmy(army_id);

                // we still need to check for enemies
                // replace unit with combined one
                army = otherArmy;
                hasMerged = true;
                joinedArmy = otherArmy._id;

                // update markers
                Markers.update({unitType:'army', unitId:army_id}, {$set:{unitId:otherArmy._id}}, {multi:true});
              }
            }

          }
        }
      })
    }

    // send alert
    dAlerts.alert_armyFinishedAllMoves(
      gameId,
      army.playerId,
      army._id,
      army.x,
      army.y,
      joinedCastle,
      joinedVillage,
      joinedArmy
    );

    // if joined with castle or village exit
    if (hasMerged && !joinedArmy){
      return;
    }
  }  // if is stopped

  // check for ally building for on ally building icon
  var onAllyBuilding = false;

  if (castle) {
    if (_.contains(['vassal', 'direct_vassal', 'mine'], castleRelation)) {
      onAllyBuilding = true;
    }
  }

  if (village) {
    if (_.contains(['vassal', 'direct_vassal', 'mine'], villageRelation)) {
      onAllyBuilding = true;
    }
  }

  if (capital) {
    if (capital.playerId == army.playerId) {
      onAllyBuilding = true;
    }
  }

  if (onAllyBuilding != army.onAllyBuilding){
    Armies.update(army._id, {$set:{onAllyBuilding:onAllyBuilding}});
  }

  // past moves
  // update army with move
  if (!hasMerged){
    var pastMoves = army.pastMoves || []
    pastMoves.unshift({x:army.x, y:army.y, moveDate:new Date()});
    pastMoves = pastMoves.slice(0, _s.armies.pastMovesToShow);
    Armies.update(army._id, {$set: {pastMoves:pastMoves}});
  }

  // battles
  // so that battle isn't called once for each enemy in hex
  var startBattle = false;

  // start battle if army does not own capital
  // or if there is an army here by any other user
  if (capital) {
    if (capital.playerId != player._id) {
      startBattle = true;
    } else {
      armies.forEach(function(otherArmy) {
        if (otherArmy.playerId != player._id) {
          startBattle = true;
        }
      })
    }
  }

  // check for armies
  if (!startBattle) {
    armies.forEach(function(otherArmy) {
      if (otherArmy._id != army._id) {

        var someoneIsDominus = false;

        if (player.is_dominus) {
          someoneIsDominus = true;
        } else {
          var otherPlayer = Players.findOne(otherArmy.playerId, {fields: {is_dominus:1}});
          if (otherPlayer.is_dominus) {
            someoneIsDominus = true;
          }
        }

        if (someoneIsDominus) {
          startBattle = true;
        }

        if (!startBattle) {
          var relation = dInit.getPlayersRelationship(player, otherArmy.playerId);
          if (_.contains(['enemy', 'enemy_ally'], relation)) {
            startBattle = true;
          }
        }
      }
    });
  }

  // enemy castles
  if (!startBattle) {
    if (castle) {
      if (_.contains(['enemy', 'enemy_ally', 'lord', 'direct_lord', 'king'], castleRelation)) {
        startBattle = true;
      }
    }
  }

  // enemy villages
  if (!startBattle) {
    if (village) {
      if (_.contains(['enemy', 'enemy_ally'], villageRelation)) {
        startBattle = true;
      }
    }
  }

  if (startBattle) {
    Queues.add('runBattle', {gameId:gameId, x:army.x, y:army.y}, {delay:0, timeout:1000*60*5}, gameId+'_'+army.x+'_'+army.y);
  }
}


dArmies.destroyArmy = function(armyId) {
  check(armyId, String);
  var fields = {playerId:1};
  var army = Armies.findOne(armyId, {fields:fields});
  if (army) {
    Armies.remove(armyId);
    Markers.remove({unitType:'army', unitId:armyId});
    Armypaths.remove({armyId:armyId});
  }
}





// both armies get the lastMoveAt time that the first army had
// the time of their next move doesn't change
dArmies.split = function(gameId, armyId, newArmySoldiers) {
  check(armyId, String);
  check(gameId, String);

  // set defaults and check
  _s.armies.types.forEach(function(type) {
    if (!newArmySoldiers[type]) {
      newArmySoldiers[type] = 0;
    }
    check(newArmySoldiers[type], Match.Integer);
  });

  var fields = {playerId:1, gameId:1, user_id:1, castle_id:1, x:1, y:1, last_move_at:1};
  _s.armies.types.forEach(function(type) {
    fields[type] = 1;
  })

  var army = Armies.findOne({_id:armyId}, {fields: fields});
  if (!army) {
    console.error('no army found in dArmies.split');
    return false;
  }

  // make sure new_army isn't more than army or less than 0
  _s.armies.types.forEach(function(type) {
    if (newArmySoldiers[type] > army[type]) {
      throw new Meteor.Error('Too many '+type+'.')
    }

    if (newArmySoldiers[type] < 0) {
      throw new Meteor.Error('Too few '+type+'.')
    }
  });

  var oldNum = 0
  _s.armies.types.forEach(function(type) {
    oldNum += army[type]
  });

  var newNum = 0
  _s.armies.types.forEach(function(type) {
    newNum += newArmySoldiers[type]
  });

  if (newNum == 0) {
    console.error('New army must have at least one soldier.');
    return false;
  }

  if (newNum >= oldNum) {
    console.error('Old army must still have at least one soldier.');
    return false;
  }

  var newArmy = dArmies.create(army.playerId, newArmySoldiers, army.x, army.y, army.last_move_at);
  if (!newArmy) {
    console.error('Could not create new army in dArmies.split');
    return false;
  }

  var set = {speed:null, moveTime:null}
  _s.armies.types.forEach(function(type) {
    set[type] = army[type] - newArmySoldiers[type];
  })

  Armies.update(army._id, {$set: set});

  return newArmy._id;
}


dArmies.joinBuilding = function(armyId) {
  check(armyId, String);

  var fields = {x:1, y:1, playerId:1, gameId:1};
  _s.armies.types.forEach(function(type) {
    fields[type] = 1;
  });

  var army = Armies.findOne({_id:armyId}, {fields: fields});
  if (!army) {
    return false;
  }

  var inc = {}
  _s.armies.types.forEach(function(type) {
    inc[type] = army[type]
  });

  var castle = Castles.findOne({playerId:army.playerId, x:army.x, y:army.y}, {fields: {_id:1}});
  if (castle) {

    Castles.update(castle._id, {$inc:inc});
    dArmies.destroyArmy(armyId);
    return {buildingId:castle._id, buildingType:'castle'};

  } else {

    var village = Villages.findOne({playerId:army.playerId, x:army.x, y:army.y}, {fields: {_id:1}});
    if (village) {

      Villages.update(village._id, {$inc:inc});
      dArmies.destroyArmy(armyId);
      return {buildingId:village._id, buildingType:'village'};

    } else {
      return false;
    }
  }
}
