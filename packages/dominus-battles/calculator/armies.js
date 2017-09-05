BattleArmy = function() {
  var self = this;

  this.units = {};

  // 'army', 'village', 'castle'
  this.unitType = 'army';

  // if set to true it will look in db for user to update allies_below etc.
  this.isRealArmy = false;

  // assign random id
  // set to _id of army or leave random value
  this._id = Math.floor(Math.random() * 1000000).toString();
  this.name = _s.armies.names.part1[_.random(_s.armies.names.part1.length-1)] +' '+ _s.armies.names.part2[_.random(_s.armies.names.part2.length-1)];

  // -----------------------------
  // private
  // these are filled in when run

  // these get filled in if isRealArmy is true
  this.playerId = Math.floor(Math.random() * 100000).toString();
  this.allies_below = [];
  this.allies_above = [];
  this.team = [];
  this.king = null;
  this.lord = null;
  this.vassals = [];
  this.is_dominus = false;

  this.createdAt = new Date();

  _s.armies.types.forEach(function(type) {
      self.units[type] = 0;
  })
}


// -------------------
// private


// run at beginning of battle to reset data
// calculator doesn't recreate army each time
BattleArmy.prototype.resetInfo = function() {
  var self = this;

  // cache these
  // run BattleRounds.cacheAllies and cacheEnemies to update
  this.allies = [];
  this.enemies = [];

  this.basePower = {};
  this.unitBonus = {};
  this.basePower.total = 0;
  this.unitBonus.total = 0;
  this.loses = {};
  this.finalPowerPerSoldier = {};
  this.percentage = {};

  _s.armies.types.forEach(function(type) {
    self.percentage[type] = 0;
    self.basePower[type] = 0;
    self.unitBonus[type] = 0;
    self.loses[type] = 0;
    self.finalPowerPerSoldier[type] = 0;
  })

  this.basePower = {};
  this.unitBonus = {};
  this.basePower.total = 0;
  this.unitBonus.total = 0;
  this.finalPowerPerSoldier = {};

  this.dif = 0;   // has army won or lost
  this.powerToLose = 0;

  this.castleDefenseBonus = false;
  this.villageDefenseBonus = false;
  this.onAllyCastleBonus = false;
  this.onAllyVillageBonus = false;

  this.enemyFinalPower = 0;
  this.teamFinalPower = 0;
  this.allyFinalPower = 0;

  this.destroyed = false;   // does unit have no soldiers after battle is over

  // true if castle was destoyed and this army became it's lord
  this.tookCastle = false;

  // true if army became owner of capital
  this.tookCapital = false;

  // if this is a castle and castle was destoyed, this is set to the id of the army who became it's lord
  this.becameVassalOf_armyId = null;
  this.becameVassalOfPlayerId = null;
}


// called at beginning of battle.run to correct armies
BattleArmy.prototype.check = function() {
  var self = this;
  _s.armies.types.forEach(function(type) {
    if (!self.units[type]) {
      self.units[type] = 0;
    }
  })
}


BattleArmy.prototype.updateUser = function() {
  if (this.isRealArmy) {
    var fields = {playerId:1, user_id:1, allies_below:1, allies_above:1, team:1, king:1, lord:1, vassals:1, is_dominus:1};

    if (Meteor.isServer) {
      var player = Players.findOne(this.playerId, {fields:fields});
    } else {
      var player = Calcplayers.findOne(this.playerId, {fields:fields});
    }

    if (player) {
      this.allies_below = player.allies_below;
      this.allies_above = player.allies_above;
      this.team = player.team;
      this.king = player.king;
      this.lord = player.lord;
      this.vassals = player.vassals;
      this.is_dominus = player.is_dominus;
    } else {
      if (Meteor.isServer) {
        // this might fail on client
        // when subscription is ready battle will re-run
        //console.error('could not find player in BattleArmy.updateUser', this, player);
      }
    }
  }
}


BattleArmy.prototype.isEnemy = function(otherArmy) {

  if (this.playerId == otherArmy.playerId) {
    return false;
  }

  if (this.isOnCapital) {
    return true;
  }

  // if army is dominus then they can attack any other army
  if (this.is_dominus && this.unitType == 'army' && otherArmy.unitType == 'army') {
    return true;
  }

  // if other army is dominus they can attack any army
  if (otherArmy.is_dominus && otherArmy.unitType == 'army' && this.unitType == 'army') {
    return true;
  }

  var player = {_id:this.playerId, team:this.team, lord:this.lord, allies_above:this.allies_above, allies_below:this.allies_below, king:this.king, vassals:this.vassals};
  var otherPlayerId = otherArmy.playerId;
  var relation = dInit.getPlayersRelationship(player, otherPlayerId);

  if (this.unitType == 'castle') {
    var enemyTypes = ['vassal', 'direct_vassal', 'enemy', 'enemy_ally'];
  }

  if (this.unitType == 'village') {
    var enemyTypes = ['enemy', 'enemy_ally'];
  }

  if (this.unitType == 'army') {
    if (otherArmy.unitType == 'castle') {
      var enemyTypes = ['enemy', 'enemy_ally', 'lord', 'direct_lord', 'king'];
    } else {
      var enemyTypes = ['enemy', 'enemy_ally'];
    }
  }

  if (this.unitType == 'capital') {
    var enemyTypes = ['enemy'];
  }

  if (_.indexOf(enemyTypes, relation) != -1) {
    return true;
  }

  return false;
}


BattleArmy.prototype.isAlly = function(otherArmy) {

  // if on capital then everyone is enemy except self
  if (this.isOnCapital) {
    return this.playerId == otherArmy.playerId;
  }

  var player = {_id:this.playerId, team:this.team, lord:this.lord, allies_above:this.allies_above, allies_below:this.allies_below, king:this.king, vassals:this.vassals};
  var otherPlayerId = otherArmy.playerId;
  var relation = dInit.getPlayersRelationship(player, otherPlayerId);

  if (this.unitType == 'castle') {
    var allyTypes = ['mine', 'king', 'direct_lord', 'lord'];
  }

  if (this.unitType == 'village') {
    var allyTypes = ['mine', 'king', 'direct_lord', 'lord', 'vassal', 'direct_vassal'];
  }

  if (this.unitType == 'army') {
    if (otherArmy.unitType == 'castle') {
      var allyTypes = ['mine', 'vassal', 'direct_vassal'];
    } else {
      var allyTypes = ['mine', 'king', 'direct_lord', 'lord', 'vassal', 'direct_vassal'];
    }
  }

  if (this.unitType == 'capital') {
    var allyTypes = [];
  }

  if (_.indexOf(allyTypes, relation) != -1) {
    return true;
  }

  return false;
}


BattleArmy.prototype.updateInfo = function() {
  var self = this;

  // num units
  self.numUnits = 0;
  self.numUnitsNoCats = 0;
  _s.armies.types.forEach(function(type) {
    self.numUnits += self.units[type];
    if (type != 'catapults') {
      self.numUnitsNoCats += self.units[type];
    }
  });
  check(self.numUnits, validNumber);

  // base power
  self.basePower.total = 0;
  self.basePower.totalNoCats = 0;
  _s.armies.types.forEach(function(type) {
    if (self.isAttacker) {
      self.basePower[type] = _s.armies.stats[type].offense * self.units[type];
      self.basePower.total += _s.armies.stats[type].offense * self.units[type];
      if (type != 'catapults') {
        self.basePower.totalNoCats += _s.armies.stats[type].offense * self.units[type];
      }
    } else {
      self.basePower[type] = _s.armies.stats[type].defense * self.units[type];
      self.basePower.total += _s.armies.stats[type].defense * self.units[type];
      if (type != 'catapults') {
        self.basePower.totalNoCats += _s.armies.stats[type].defense * self.units[type];;
      }
    }
  });

  // percentage
  _s.armies.types.forEach(function(type) {
    if (self.units[type] == 0) {
      self.percentage[type] = 0
    } else {
      self.percentage[type] = self.units[type] / self.numUnits
    }
  });

  // percentage without catapults
  _s.armies.types.forEach(function(type) {
    if (self.units[type] == 0) {
      self.percentage[type+'NoCats'] = 0
    } else {
      self.percentage[type+'NoCats'] = self.units[type] / self.numUnitsNoCats
    }
  });
}


BattleArmy.prototype.updateLocationBonus = function() {
  var self = this;

  self.castleDefenseBonus = false;
  self.villageDefenseBonus = false;
  self.capitalDefenseBonus = false;
  self.onAllyCastleBonus = false;
  self.onAllyVillageBonus = false;
  self.locationBonus = 0;

  if (self.unitType == 'castle') {
    self.locationBonus = self.basePower.total * (_s.castles.defense_bonus - 1);
    self.castleDefenseBonus = true;
  }

  if (self.unitType == 'village') {
    self.locationBonus = self.basePower.total * (_s.villages.defense_bonus - 1);
    self.villageDefenseBonus = true
  }

  if (self.unitType == 'capital') {
    self.locationBonus = self.basePower.total * (_s.capitals.battleBonus - 1);
    self.capitalDefenseBonus = true
  }

  if (self.unitType == 'army') {
    if (self.isOnAllyCastle) {
      self.locationBonus = self.basePower.total * (_s.castles.ally_defense_bonus - 1);
      self.onAllyCastleBonus = true;
    }

    if (self.isOnAllyVillage) {
      self.locationBonus = self.basePower.total * (_s.villages.ally_defense_bonus - 1);
      self.onAllyVillageBonus = true;
    }

    if (self.isOnAllyCapital) {
      self.locationBonus = self.basePower.total * (_s.capitals.battleBonus - 1);
    }
  }

  check(self.locationBonus, validNumber);
}



BattleArmy.prototype.updateFinalPower = function() {
  this.finalPower = this.basePower.total + this.unitBonus.total + this.locationBonus;
  check(this.finalPower, validNumber);
}



BattleArmy.prototype.updateFinalPowerOfEachSoldierType = function() {
  var self = this;

  var locationBonusPerSoldier = self.locationBonus / self.numUnits;

  _s.armies.types.forEach(function(type) {
    self.finalPowerPerSoldier[type] = self.basePower[type] + self.unitBonus[type]

    // divide by number of soldiers
    if (self.units[type] == 0) {
      self.finalPowerPerSoldier[type] = 0;
    } else {
      self.finalPowerPerSoldier[type] = self.finalPowerPerSoldier[type] / self.units[type];

      // add location bonus
      self.finalPowerPerSoldier[type] += locationBonusPerSoldier;
    }

    check(self.finalPowerPerSoldier[type], validNumber);
  })
}



// after powerToLose is set call this to find loses
BattleArmy.prototype.findLoses = function() {
  var self = this

  var loses = {};
  _s.armies.types.forEach(function(type) {
    loses[type] = 0;
  })

  if (this.numUnits == 0) {
    this.loses = loses;

    // can't have army with zero soldiers
    // can have village or castle with zero soldiers
    if (this.unitType != 'army' && this.enemies.length == 0) {
      this.destroyed = false;
    } else {
      this.destroyed = true;
    }

    return;
  }

  // find which soldier is worth the least
  var smallestSoldierPower = 9999999;
  _s.armies.types.forEach(function(type) {
    if (self.finalPowerPerSoldier[type] > 0 && self.finalPowerPerSoldier[type] < smallestSoldierPower) {
      smallestSoldierPower = self.finalPowerPerSoldier[type];
    }
  })

  // take away until powerToLose is < smallestSoldierPower
  var fails = 0;
  var maxFails = _s.armies.types.length;
  var powerLeft = this.powerToLose;
  var numUnits = this.numUnits;
  while (powerLeft > 0 && numUnits > 0 && fails < maxFails) {
    _s.armies.types.forEach(function(type) {

      // if there is a unit of this type in army
      if (self.units[type] - loses[type] > 0) {

        // if there is enough power left to take this unit away
        if (self.finalPowerPerSoldier[type] <= powerLeft) {

          loses[type]++;
          numUnits--;
          powerLeft -= self.finalPowerPerSoldier[type];

        } else {
          fails++;
        }
      }

    })
  }

  if (numUnits == 0) {
    this.destroyed = true;
  }

  this.loses = loses;
}
