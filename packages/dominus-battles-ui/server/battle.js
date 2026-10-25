

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.runBattle.process(5, async function(job) {
    check(job.data.gameId, String);
    check(job.data.x, validNumber);
    check(job.data.y, validNumber);

    var battle = new BattleJob(job.data.gameId, job.data.x, job.data.y);
    await battle.runBattle();
  });
}


BattleJob = function(gameId, x, y) {
  check(gameId, String);
  check(x, Match.Integer);
  check(y, Match.Integer);

  this.x = x;
  this.y = y;
  this.gameId = gameId;

  // filled in when run
  this.currentRound = null;
  this.battleData = null;
}


BattleJob.prototype.runBattle = async function() {
  var self = this;

  // check for a battle going on here
  // this returns the document before it is modified (isRunning is set)
  // self.battleData = Battles2.findAndModify({
  //   query: {gameId:self.gameId, x:self.x, y:self.y, isOver:false},
  //   update: {$set:{isRunning:true}}
  // });

  self.battleData = await Battles2.findOneAsync({gameId:self.gameId, x:self.x, y:self.y, isOver:false})

  // if found a battle
  if (self.battleData) {
    // Atomically claim this battle round. The previous code set isRunning:true
    // and then checked the STALE self.battleData.isRunning read before the
    // update, so two concurrent runBattle jobs for the same hex (process(5) +
    // stalled-job reprocessing) could both pass the guard and run the round,
    // applying losses and set_lord_and_vassal/setOwner twice. Only the worker
    // whose conditional update actually flips isRunning to true proceeds.
    var claimed = await Battles2.updateAsync({_id:self.battleData._id, isRunning:{$ne:true}}, {$set:{isRunning:true}});
    if (!claimed) {
      return;
    }

    // make sure it's past time to do battle
    let interval = _gs.battles(self.gameId, 'battleInterval');
    var cutoff = moment(dClock.now()).subtract(interval, 'ms').toDate();
    var battleDate = moment(new Date(self.battleData.updatedAt));
    if (battleDate.isAfter(cutoff)) {

      // abort if battle was too recent
      await Battles2.updateAsync(self.battleData._id, {$set: {isRunning:false}});
      return;
    } else {

      // battle is a go!
      self.battleData.roundNumber++;
    }
  } else {

    // create new battle
    self.battleData = {
      gameId:self.gameId,
      x:self.x,
      y:self.y,
      isRunning:true,
      createdAt:dClock.now(),
      updatedAt:dClock.now(),
      roundNumber:1,
      isOver:false,
      loses:[],

      // used in alerts panel
      // if no losses then don't show in alerts battle panel
      // if something destroyed then show battle
      showBattle:false,

      // list of armies who were in battle previously to this round
      // used to figure out who to send entered battle alert to
      unitsFromPreviousRounds:[]
    }

    // insert so that isRunning is true
    self.battleData._id = await Battles2.insertAsync(self.battleData);
  }

  self.currentRound = new BattleRound();
  self.currentRound.gameId = self.gameId;

  await self.gatherData();
  self.findOrderOfArrival();
  await self.currentRound.runAsync();
  await self.processBattleResults();
  await self.saveRound();
  await self.saveBattle();
  await self.updateOnAllyBuildingIcon();
}



BattleJob.prototype.updateOnAllyBuildingIcon = async function() {
  var self = this;

  for (const army of self.currentRound.armies) {
    if (army.unitType == 'army' && !army.destroyed) {
      if (self.currentRound.castle) {
        if (army.tookCastle) {
          await Armies.updateAsync(army._id, {$set:{onAllyBuilding:true}});
        }
      }

      if (self.currentRound.capitol) {
        if (army.tookCapital) {
          await Armies.updateAsync(army._id, {$set:{onAllyBuilding:true}});
        }
      }
    }
  }
}



BattleJob.prototype.processBattleResults = async function() {
  var self = this;

  for (const army of self.currentRound.armies) {

    var inc = {};
    _s.armies.types.forEach(function(type) {
      inc[type] = army.loses[type] * -1;

      if (army.loses[type]) {
        self.battleData.showBattle = true;
      }
    })

    switch(army.unitType) {
      case 'capital':
        if (army.destroyed) {
          self.battleData.showBattle = true;
        }
        await Capitals.updateAsync(army._id, {$inc:inc});
        break;
      case 'castle':

        if (army.destroyed) {
          self.battleData.showBattle = true;

          // give castle away
          if (army.becameVassalOfPlayerId) {
            var lord = await Players.findOneAsync(army.becameVassalOfPlayerId, {fields:{_id:1}});
            var vassal = await Players.findOneAsync(army.playerId, {fields:{_id:1}});
            if (lord && vassal) {
              await dInit.set_lord_and_vassal(lord._id, vassal._id);
            }
          }
        }

        await Castles.updateAsync(army._id, {$inc:inc});

        break;
      case 'village':

        if (army.destroyed) {
          self.battleData.showBattle = true;

          dAlerts.alert_villageDestroyed(self.gameId, army.playerId, self.battleData._id, army.name);
          await Villages.removeAsync(army._id);
          Mapmaker.buildingRemoved(self.gameId, army.x, army.y);
        } else {
          await Villages.updateAsync(army._id, {$inc:inc});
        }

        break;
      case 'army':

        if (army.destroyed) {
          self.battleData.showBattle = true;

          dAlerts.alert_armyDestroyed(self.gameId, army.playerId, self.battleData._id, army.name);
          await dArmies.destroyArmy(army._id);

        } else {

          // give capital away, send alerts, update army onAllyBuilding summary icon
          if (self.currentRound.capital && army.tookCapital) {
            self.battleData.showBattle = true;
            await dCapitals.setOwner(self.gameId, army.playerId, self.currentRound.capital._id);
          }

          await Armies.updateAsync(army._id, {$inc:inc, $set: {speed:null, moveTime:null}});
        }
        break;
    }

    await self.trackLosesInPlayer(army);
  }
}




// for rankings
BattleJob.prototype.trackLosesInPlayer = async function(army) {
  if (army.unitType != 'capital') {
    check(army.playerId, String);

    var self = this;

    var inc = {};

    _.each(army.loses, function(value, key) {
      inc["losses."+key] = value;
    })

    var num = await Players.updateAsync(army.playerId, {$inc:inc});
    if (num) {
      await Queues.addAsyncOrLog('update_losses_worth', {playerId:army.playerId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60}, false);
    }
  }
}



BattleJob.prototype.gatherData = async function() {
  var self = this;

  var castleFields = {playerId:1, gameId:1, name:1, user_id:1, x:1, y:1, username:1, image:1};
  var armyFields = {playerId:1, gameId:1, name:1, user_id:1, x:1, y:1, last_move_at:1, username:1, castle_x:1, castle_y:1, castle_id:1};
  var villageFields = {playerId:1, gameId:1, name:1, user_id:1, x:1, y:1, username:1, castle_x:1, castle_y:1, castle_id:1};
  var capitalFields = {playerId:1, gameId:1, x:1, y:1, name:1};

  _s.armies.types.forEach(function(type) {
    castleFields[type] = 1;
    armyFields[type] = 1;
    villageFields[type] = 1;
    capitalFields[type] = 1;
  })

  var castleData = await Castles.findOneAsync({gameId:self.gameId, x:self.x, y:self.y}, {fields: castleFields});
  var villageData = await Villages.findOneAsync({gameId:self.gameId, x:self.x, y:self.y}, {fields: villageFields});
  var capitalData = await Capitals.findOneAsync({gameId:self.gameId, x:self.x, y:self.y}, {fields: capitalFields});

  // capitals must happen before armies
  if (capitalData) {
    var capital = new BattleArmy();
    capital.unitType = 'capital';
    processUnit(capital, capitalData);
    self.currentRound.armies.push(capital);
    self.currentRound.capital = capital;
  }

  for (const a of await Armies.find({gameId:self.gameId, x:self.x, y:self.y}, {fields: armyFields}).fetchAsync()) {
    var army =  new BattleArmy();
    army.unitType = 'army';
    processUnit(army, a);
    self.currentRound.armies.push(army);
    await self.handleEnteredAlert(army);
  }

  if (castleData) {
    var castle = new BattleArmy();
    castle.unitType = 'castle';
    processUnit(castle, castleData);
    self.currentRound.armies.push(castle);
    self.currentRound.castle = castle;
    await self.handleEnteredAlert(castle);
  }

  if (villageData) {
    var village = new BattleArmy();
    village.unitType = 'village';
    processUnit(village, villageData);
    self.currentRound.armies.push(village);
    self.currentRound.village = village;
    await self.handleEnteredAlert(village);
  }
}



BattleJob.prototype.findOrderOfArrival = function() {
  var self = this;

  // check that every army has last_move_at
  _.each(self.currentRound.armies, function(army) {
    if (!army.last_move_at) {
      console.error('no army.last_move_at');
    }
  })

  // sort
  self.currentRound.armies = _.sortBy(self.currentRound.armies, function(army) {
    return army.last_move_at;
  });

  // set orderOfArrival
  var num = 0;
  _.each(self.currentRound.armies, function(army) {
    army.orderOfArrival = num;
    num++;
  });
}



BattleJob.prototype.handleEnteredAlert = async function(army) {
  var self = this;

  // has alert already been sent?
  if (_.indexOf(self.battleData.unitsFromPreviousRounds, army._id) == -1) {
    // send alert
    // if army is on it's own capital then send capital alert
    if (army.unitType == 'army') {
      if (self.currentRound.capital && self.currentRound.capital.playerId == army.playerId) {
        dAlerts.alert_battleStart(self.gameId, army.playerId, self.currentRound.capital._id, 'capital', self.battleData._id);
      } else {
        dAlerts.alert_battleStart(self.gameId, army.playerId, army._id, 'army', self.battleData._id);
      }
    }

    // if this is a castle send alert to lords that vassal is under attack
    // allies_above is filled in when battle is run
    // so have to get it here
    if (army.unitType == 'castle') {
      dAlerts.alert_battleStart(self.gameId, army.playerId, army._id, 'castle', self.battleData._id);

      var player = await Players.findOneAsync(army.playerId,  {fields: {allies_above:1}});
      if (player && player.allies_above) {
        dAlerts.alert_vassalIsUnderAttack(self.gameId, player.allies_above, army.playerId, self.battleData._id);
      }
    }

    if (army.unitType == 'village') {
      dAlerts.alert_battleStart(self.gameId, army.playerId, army._id, 'village', self.battleData._id);
    }

    // add to array so that we know not to send alert next round
    self.battleData.unitsFromPreviousRounds.push(army._id);
  }
}



BattleJob.prototype.saveRound = async function() {
  var self = this;

  // flatten allies and enemies or creates call stack size exceeded error
  var keysToPick = ['_id', 'username', 'unitType', 'x', 'y', 'name'];

  var armies = _.map(self.currentRound.armies, function(army) {
    army.allies = _.map(army.allies, function(ally) {
      return _.pick(ally, keysToPick);
    })
    army.enemies = _.map(army.enemies, function(enemy) {
      return _.pick(enemy, keysToPick);
    })
    return army;
  })

  var roundData = _.omit(self.currentRound, 'armies');
  roundData.armies = armies;
  roundData.battle_id = self.battleData._id;
  roundData.roundNumber = self.battleData.roundNumber;
  roundData.createdAt = dClock.now();
  roundData.gameId = self.gameId;
  roundData = _.omit(roundData, _.functions(roundData));

  await Rounds.insertAsync(roundData);
}



BattleJob.prototype.saveBattle = async function() {
  var self = this;

  // info for battleTitles
  self.battleData.titleInfo = {};
  self.battleData.titleInfo.armies = [];

  _.each(self.currentRound.armies, function(army) {

    // info for battleTitles
    var titleInfo = {
      gameId: self.gameId,
      name: army.name,
      username: army.username,
      unitType: army.unitType,
      destroyed: army.destroyed,
      tookCastle: army.tookCastle,
      tookCapital: army.tookCapital
    }
    self.battleData.titleInfo.armies.push(titleInfo);

    // check for preexisting losses
    var data = _.find(self.battleData.loses, function(l) {
      return l._id == army._id;
    })

    if (data) {

      // remove from roundData.losses
      self.battleData.loses = _.reject(self.battleData.loses, function(l) {
        return l._id == army._id;
      })

    } else {

      // if no losses set to 0
      if (!data) {
        data = {
          _id:army._id,
          castle_id:army.castle_id,
          name:army.name,
          user_id:army.user_id,
          playerId:army.playerId,
          username:army.username,
          x:army.x,
          y:army.y,
          total:0,
          power:0,
          unitType:army.unitType
        }

        _s.armies.types.forEach(function(type) {
          data[type] = 0;
        })
      }
    }

    // add loses from current round
    _s.armies.types.forEach(function(type) {
      data[type] += army.loses[type];
      data.total += army.loses[type];
      data.power += army.finalPowerPerSoldier[type] * army.loses[type];
    })

    self.battleData.loses.push(data);
  })

  self.battleData.updatedAt = dClock.now();
  self.battleData.isOver = self.currentRound.battleIsOver;
  self.battleData.isRunning = false;

  await Battles2.updateAsync(self.battleData._id, self.battleData);
}




var processUnit = function(unit, unitData) {
  _s.armies.types.forEach(function(type) {
    unit.units[type] = unitData[type];
  })

  unit.user_id = unitData.user_id;
  unit.playerId = unitData.playerId;
  unit.isRealArmy = true;
  unit.name = unitData.name;
  unit._id = unitData._id;
  unit.username = unitData.username;
  unit.x = unitData.x;
  unit.y = unitData.y;

  // used in clickable link in battle report
  if (unit.unitType != 'castle') {
    unit.castle_x = unitData.castle_x;
    unit.castle_y = unitData.castle_y;
  }

  if (unitData.last_move_at) {
    unit.last_move_at = unitData.last_move_at;
  } else {
    unit.last_move_at = new Date(0);
  }

  if (unitData.castle_id) {
    unit.castle_id = unitData.castle_id;
  }
}
