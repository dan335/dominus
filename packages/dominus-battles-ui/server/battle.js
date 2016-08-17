

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.runBattle.process(5, Meteor.bindEnvironment(function(job) {
    check(job.data.gameId, String);
    check(job.data.x, validNumber);
    check(job.data.y, validNumber);

    var battle = new BattleJob(job.data.gameId, job.data.x, job.data.y);
    battle.runBattle();
    return Promise.resolve();
  }));
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


BattleJob.prototype.runBattle = function() {
  var self = this;

  // check for a battle going on here
  // this returns the document before it is modified (isRunning is set)
  // self.battleData = Battles2.findAndModify({
  //   query: {gameId:self.gameId, x:self.x, y:self.y, isOver:false},
  //   update: {$set:{isRunning:true}}
  // });

  self.battleData = Battles2.findOne({gameId:self.gameId, x:self.x, y:self.y, isOver:false})

  // if found a battle
  if (self.battleData) {
    Battles2.update(self.battleData._id, {$set:{isRunning:true}});

    // abort if already running
    if (self.battleData.isRunning) {
      return;
    }

    // make sure it's past time to do battle
    let interval = _gs.battles(self.gameId, 'battleInterval');
    var cutoff = moment().subtract(interval, 'ms').toDate();
    var battleDate = moment(new Date(self.battleData.updatedAt));
    if (battleDate.isAfter(cutoff)) {

      // abort if battle was too recent
      Battles2.update(self.battleData._id, {$set: {isRunning:false}});
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
      createdAt:new Date(),
      updatedAt:new Date(),
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
    self.battleData._id = Battles2.insert(self.battleData);
  }

  self.currentRound = new BattleRound();
  self.currentRound.gameId = self.gameId;

  self.gatherData();
  self.findOrderOfArrival();
  self.currentRound.run();
  self.processBattleResults();
  self.saveRound();
  self.saveBattle();
  self.updateOnAllyBuildingIcon();
}



BattleJob.prototype.updateOnAllyBuildingIcon = function() {
  var self = this;

  self.currentRound.armies.forEach(function(army) {
    if (army.unitType == 'army' && !army.destroyed) {
      if (self.currentRound.castle) {
        if (army.tookCastle) {
          Armies.update(army._id, {$set:{onAllyBuilding:true}});
        }
      }

      if (self.currentRound.capitol) {
        if (army.tookCapital) {
          Armies.update(army._id, {$set:{onAllyBuilding:true}});
        }
      }
    }
  });
}



BattleJob.prototype.processBattleResults = function() {
  var self = this;

  _.each(self.currentRound.armies, function(army) {

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
        Capitals.update(army._id, {$inc:inc});
        break;
      case 'castle':

        if (army.destroyed) {
          self.battleData.showBattle = true;

          // give castle away
          if (army.becameVassalOfPlayerId) {
            var lord = Players.findOne(army.becameVassalOfPlayerId, {fields:{_id:1}});
            var vassal = Players.findOne(army.playerId, {fields:{_id:1}});
            if (lord && vassal) {
              dInit.set_lord_and_vassal(lord._id, vassal._id);
            }
          }
        }

        Castles.update(army._id, {$inc:inc});

        break;
      case 'village':

        if (army.destroyed) {
          self.battleData.showBattle = true;

          dAlerts.alert_villageDestroyed(self.gameId, army.playerId, self.battleData._id, army.name);
          Villages.remove(army._id);
          Mapmaker.buildingRemoved(self.gameId, army.x, army.y);
        } else {
          Villages.update(army._id, {$inc:inc});
        }

        break;
      case 'army':

        if (army.destroyed) {
          self.battleData.showBattle = true;

          dAlerts.alert_armyDestroyed(self.gameId, army.playerId, self.battleData._id, army.name);
          dArmies.destroyArmy(army._id);

        } else {

          // give capital away, send alerts, update army onAllyBuilding summary icon
          if (self.currentRound.capital && army.tookCapital) {
            self.battleData.showBattle = true;
            dCapitals.setOwner(self.gameId, army.playerId, self.currentRound.capital._id);
          }

          Armies.update(army._id, {$inc:inc, $set: {speed:null, moveTime:null}});
        }
        break;
    }

    self.trackLosesInPlayer(army);
  })
}




// for rankings
BattleJob.prototype.trackLosesInPlayer = function(army) {
  if (army.unitType != 'capital') {
    check(army.playerId, String);

    var self = this;

    var inc = {};

    _.each(army.loses, function(value, key) {
      inc["losses."+key] = value;
    })

    var num = Players.update(army.playerId, {$inc:inc});
    if (num) {
      Queues.add('update_losses_worth', {playerId:army.playerId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60}, false);
    }
  }
}



BattleJob.prototype.gatherData = function() {
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

  var armies = Armies.find({gameId:self.gameId, x:self.x, y:self.y}, {fields: armyFields});
  var castleData = Castles.findOne({gameId:self.gameId, x:self.x, y:self.y}, {fields: castleFields});
  var villageData = Villages.findOne({gameId:self.gameId, x:self.x, y:self.y}, {fields: villageFields});
  var capitalData = Capitals.findOne({gameId:self.gameId, x:self.x, y:self.y}, {fields: capitalFields});

  // capitals must happen before armies
  if (capitalData) {
    var capital = new BattleArmy();
    capital.unitType = 'capital';
    processUnit(capital, capitalData);
    self.currentRound.armies.push(capital);
    self.currentRound.capital = capital;
  }

  armies.forEach(function(a) {
    var army =  new BattleArmy();
    army.unitType = 'army';
    processUnit(army, a);
    self.currentRound.armies.push(army);
    self.handleEnteredAlert(army);
  });

  if (castleData) {
    var castle = new BattleArmy();
    castle.unitType = 'castle';
    processUnit(castle, castleData);
    self.currentRound.armies.push(castle);
    self.currentRound.castle = castle;
    self.handleEnteredAlert(castle);
  }

  if (villageData) {
    var village = new BattleArmy();
    village.unitType = 'village';
    processUnit(village, villageData);
    self.currentRound.armies.push(village);
    self.currentRound.village = village;
    self.handleEnteredAlert(village);
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



BattleJob.prototype.handleEnteredAlert = function(army) {
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

      var player = Players.findOne(army.playerId,  {fields: {allies_above:1}});
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



BattleJob.prototype.saveRound = function() {
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
  roundData.createdAt = new Date();
  roundData.gameId = self.gameId;
  roundData = _.omit(roundData, _.functions(roundData));

  Rounds.insert(roundData);
}



BattleJob.prototype.saveBattle = function() {
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

  self.battleData.updatedAt = new Date();
  self.battleData.isOver = self.currentRound.battleIsOver;
  self.battleData.isRunning = false;

  Battles2.update(self.battleData._id, self.battleData);
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
