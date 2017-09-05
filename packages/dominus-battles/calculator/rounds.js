// create armies
// add armies to BattleRound
// set all army info
// call BattleRound.run()

// update army info
// call BattleRound.run()


BattleRound = function() {
  // array of BattleArmies
  this.armies = [];

  // if there is a castle here fill this in with it's info
  // {name:1, user_id:1, x:1, y:1, username:1, image:1} + soldiers
  this.castle = null;

  // if there is a village here fill this in with it's info
  // {name:1, user_id:1, x:1, y:1, username:1, castle_x:1, castle_y:1, castle_id:1} + soldiers
  this.village = null;

  // capital's info or null
  // set this before running
  this.capital = null;

  // ----------------------
  // private

  // power of all armies combined
  this.finalPowerAllArmies = 0;

  this.battleHasRun = false;
  this.msBattleTook = 0;

  this.battleIsOver = null;
}



// BattleRound.prototype.addArmy = function(army) {
//   this.armies.push(army);
// }


BattleRound.prototype.run = function() {
  var self = this;

  var start = new Date().getTime();

  self.armies.forEach(function(army) {
    army.resetInfo();
    army.check();
    army.updateUser();
  });

  self.setCapitalStatus();

  self.checkOrderOfArrival();

  _.each(self.armies, function(army) {
    self.cacheAllies(army);
    self.cacheEnemies(army);
  });

  self.findDefender();
  self.checkThatThereIsOnlyOneDefender();
  self.setAlliesOfDefenderToDefender();

  _.each(self.armies, function(army) {
    army.updateInfo();
    self.isOnAllyBuilding(army);
    army.updateLocationBonus();
    self.updateUnitBonus(army);
    army.updateFinalPower();
    army.updateFinalPowerOfEachSoldierType();
  })

  // do battle
  _.each(self.armies, function(army) {
    army.dif = self.getTeamFinalPower(army) - self.getEnemyFinalPower(army);
    self.findPowerToLose(army);
    army.findLoses();
  })

  self.isBattleIsOver();
  if (self.battleIsOver) {
    self.handleCastle();
    self.handleCapital();
  }

  self.battleHasRun = true;
  self.msBattleTook = new Date().getTime() - start;
}



// -----------------------
// private

BattleRound.prototype.setCapitalStatus = function(army) {
  var self = this;

  self.armies.forEach(function(army) {
    army.isOnCapital = false;
    army.isOnAllyCapital = false;

    if (self.capital) {
      army.isOnCapital = true;
      if (army.playerId == self.capital.playerId) {
        army.isOnAllyCapital = true;
      }
    }
  })
}

BattleRound.prototype.isOnAllyBuilding = function(army) {
  var self = this;

  if (army.unitType != 'army') {
    return;
  }

  army.isOnAllyCastle = false;
  army.isOnAllyVillage = false;

  if (self.castle) {
    if (army.isAlly(self.castle)) {
      army.isOnAllyCastle = true;
    }
  }

  if (self.village) {
    if (army.isAlly(self.village)) {
      army.isOnAllyVillage = true;
    }
  }
}


BattleRound.prototype.handleCapital = function() {
  var self = this;

  if (!self.capital) {
    return;
  }

  // should only be one user with surviving armies
  var armiesThatTookCapital = [];

  self.armies.forEach(function(army) {
    if (army.unitType != 'capital') {
      if (army.unitType == 'army') {
        if (!army.destroyed) {
          armiesThatTookCapital.push(army);
        }
      } else {
        console.error('Army in handleCapital that is not an army', army, self);
      }
    }
  });

  var tookCastlePlayerId = null;
  armiesThatTookCapital.forEach(function(army) {
    if (!tookCastlePlayerId) {
      tookCastlePlayerId = army.playerId;
    } else {
      if (tookCastlePlayerId != army.playerId) {
        console.error('More than one player took capital in handleCapital', armiesThatTookCapital, self);
        return false;
      }
    }
  })

  armiesThatTookCapital.forEach(function(army) {
    // if army does not already own capital give it to them
    if (army.playerId != self.capital.playerId) {
      army.tookCapital = true;
    }
  });
}



BattleRound.prototype.handleCastle = function() {
  var self = this;

  if (!self.castle) {
    return;
  }

  // find which army is castle
  var castle = _.find(self.armies, function(a) {
    return a.unitType == 'castle';
  })

  // if castle destroyed
  if (castle && castle.destroyed) {
    // find who gets castle
    // find first army to arrive
    // then find highest person in that tree
    var smallestOrderOfArrival = 999999;
    var firstEnemyArmy = null;
    _.each(self.armies, function(army) {
      if (army.unitType == 'army') {
        if (!army.destroyed) {
          if (castle.isEnemy(army)) {
            if (army.orderOfArrival < smallestOrderOfArrival) {
              smallestOrderOfArrival = army.orderOfArrival;
              firstEnemyArmy = army;
            }
          }
        }
      }
    })

    if (firstEnemyArmy) {
      // find highest person in this tree
      // find them by checking who has the least allies_above
      var castleWinner = firstEnemyArmy;
      var numAbove = firstEnemyArmy.allies_above
      _.each(firstEnemyArmy.allies_above, function(personAboveFirstArmy_id) {

        if (personAboveFirstArmy_id != castle.playerId) {

          var personAboveFirstArmy = _.find(self.armies, function(a) {
            return a.playerId == personAboveFirstArmy_id;
          })

          if (personAboveFirstArmy) {
            if (personAboveFirstArmy.allies_above.length < numAbove) {
              castleWinner = dude;
              numAbove = personAboveFirstArmy.allies_above.length;
            }
          }
        }

      })
    }

    if (castleWinner) {
      castle.becameVassalOf_armyId = firstEnemyArmy._id;
      castle.becameVassalOfPlayerId = firstEnemyArmy.playerId;
      firstEnemyArmy.tookCastle = true;
    }
  }
}



BattleRound.prototype.isBattleIsOver = function() {
  var self = this;

  var numAliveArmies = 0;
  self.armies.forEach(function(army) {
    if (!army.destroyed) {
      numAliveArmies++;
    }
  })

  if (numAliveArmies < 2) {
    self.battleIsOver = true;
    return;
  }

  var someoneHasAnEnemy = false;
  _.each(self.armies, function(army) {
    if (!army.destroyed) {
      _.each(army.enemies, function(enemy) {
        if (!enemy.destroyed) {
          if (enemy.unitType == 'castle') {

            // if castle has no soldiers then it's not an enemy
            // might be a better way to do this
            if (enemy.numUnits) {
              someoneHasAnEnemy = true;
            }

          } else {
            someoneHasAnEnemy = true;
          }
        }
      })
    }
  })

  self.battleIsOver = !someoneHasAnEnemy;
}




BattleRound.prototype.isThereABuildingInBattle = function() {
  var self = this;
  var found = false;
  _.each(self.armies, function(army) {
    if (army.unitType == 'castle' || army.unitType == 'village' || army.unitType == 'capital') {
      found = true;
    }
  })
  return found;
}



BattleRound.prototype.checkThatThereIsOnlyOneDefender = function() {
  var self = this;

  var defender = null;
  self.armies.forEach(function(army) {
    if (!army.isAttacker) {
      if (defender) {
        console.error('should only be one defender');
      }

      defender = army;
    }
  })
}


BattleRound.prototype.setAlliesOfDefenderToDefender = function() {
  var self = this;

  // get defender
  var defender = null;
  _.each(self.armies, function(army) {
    if (!army.isAttacker) {
      defender = army;
    }
  })

  if (defender) {
    _.each(defender.allies, function(ally) {
      ally.isAttacker = false;
    })
  }
}


BattleRound.prototype.findDefender = function() {
  var self = this;
  var defenderFound = false;

  // set everyone to attacker
  _.each(self.armies, function(army) {
    army.isAttacker = true;
  })

  // if there is a castle or village or capital then they are defender
  _.each(self.armies, function(army) {
    if (army.unitType == 'castle' || army.unitType == 'village' || army.unitType == 'capital') {
      army.isAttacker = false;
      defenderFound = true;
    }
  })

  // if army is on their own castle, capital or village then they are defender
  if(!defenderFound) {
    if (self.castle || self.village || self.capital) {
      _.each(self.armies, function(army) {
        if (self.castle) {
          if (self.castle.playerId == army.playerId) {
            army.isAttacker = false;
            defenderFound = true;
          }
        }

        if (self.village) {
          if (self.village.playerId == army.playerId) {
            army.isAttacker = false;
            defenderFound = true;
          }
        }

        if (self.capital) {
          if (self.capital.playerId == army.playerId) {
            army.isAttacker = false;
            defenderFound = true;
          }
        }
      })
    }
  }

  // if no castle or village then go by army.orderOfArrival
  if (!defenderFound) {
    var army = self.armies[0];
    if (army) {
      if (army.unitType != 'army') {
        console.error('should be army');
      }

      army.isAttacker = false;
    }
  }
}


// make sure orderOfArrival is correct
// castle or village first if they exist
BattleRound.prototype.checkOrderOfArrival = function() {
  var self = this;

  // is there a castle, capital or village here
  // if so then they're first
  _.each(self.armies, function(army) {
    if (army.unitType == 'castle' || army.unitType == 'village' || army.unitType == 'capital') {
      army.orderOfArrival = -10;
    }
  });

  // sort
  self.armies = _.sortBy(self.armies, function(army) {
    return army.orderOfArrival;
  });

  // set orderOfArrival
  var num = 0;
  _.each(self.armies, function(army) {
    army.orderOfArrival = num;
    num++;
  });
}


BattleRound.prototype.updateUnitBonus = function(army) {
  var self = this;

  var enemyPercentage = this.getEnemyUnitPercentage(army);

  var bonus = {};
  bonus.footmen = army.basePower.footmen * enemyPercentage['pikemenNoCats'] * _s.battles.unitBonusMultiplier;
  bonus.archers = army.basePower.archers * enemyPercentage['footmenNoCats'] * _s.battles.unitBonusMultiplier;
  bonus.pikemen = army.basePower.pikemen * enemyPercentage['cavalryNoCats'] * _s.battles.unitBonusMultiplier;
  bonus.cavalry = army.basePower.cavalry * (enemyPercentage['footmenNoCats'] + enemyPercentage['archersNoCats']) * _s.battles.unitBonusMultiplier;

  // catapults
  // if there is an enemy castle of village in this hex then catapults get bonus
  // catapults must be attacker to get bonus
  // catapults get bonus even if building is not in fight
  // this is to stop building from sending out units and cats losing their bonus
  bonus.catapults = 0;

  if (army.units.catapults) {

    var isEnemyCastleOrVillageHere = false;

    if (army.isAttacker) {
      if (self.castle && self.castle.playerId != army.playerId) {
        if (army.isEnemy(self.castle)) {
          isEnemyCastleOrVillageHere = true;
        }
      }

      if (self.village && self.village.playerId != army.playerId) {
        if (army.isEnemy(self.village)) {
          isEnemyCastleOrVillageHere = true;
        }
      }

      if (self.capital && self.capital.playerId != army.playerId) {
        isEnemyCastleOrVillageHere = true;
      }

      if (isEnemyCastleOrVillageHere) {
        bonus.catapults = army.basePower.catapults * _s.armies.stats.catapults.bonus_against_buildings;
      }
    }
  }

  bonus.total = 0;
  _s.armies.types.forEach(function(type) {
    check(bonus[type], validNumber);
    bonus.total += bonus[type];
  })

  army.unitBonus = bonus;
}




BattleRound.prototype.getEnemyUnitPercentage = function(army) {
  var percentage = {};

  _s.armies.types.forEach(function(type) {
    percentage[type] = 0;
    percentage[type+'NoCats'] = 0;
  })

  var num = this.getEnemyNumUnits(army);

  _s.armies.types.forEach(function(type) {

    if (num[type] == 0 || num.total == 0) {
      percentage[type] = 0;
    } else {
      percentage[type] = num[type] / num.total;
      check(percentage[type], validNumber);
    }

    if (num[type] == 0 || num.totalNoCats == 0) {
      percentage[type+'NoCats'] = 0;
    } else {
      percentage[type+'NoCats'] = num[type] / num.totalNoCats;
      check(percentage[type+'NoCats'], validNumber);
    }

  })
  return percentage;
}



BattleRound.prototype.getEnemyNumUnits = function(army) {
  var num = {};
  num.total = 0;
  num.totalNoCats = 0;
  _.each (_s.armies.types, function(type) {
    num[type] = 0;
  })

  var enemies = army.enemies;

  _.each(enemies, function(enemy) {
    _s.armies.types.forEach(function(type) {
      if (enemy.units[type]) {
        num[type] += enemy.units[type];
        num.total += enemy.units[type];
        if (type != 'catapults') {
          num.totalNoCats += enemy.units[type];
        }
      }

      check(num[type], validNumber);
    })
  })
  return num;
}



// cache these
BattleRound.prototype.cacheAllies = function(army) {
  army.allies = this.getAllies(army);
}

BattleRound.prototype.cacheEnemies = function(army) {
  army.enemies = this.getEnemies(army);
}



BattleRound.prototype.getTeamFinalPower = function(army) {
  var teamFinalPower = 0;

  // call cacheAllies before this
  var allies = army.allies;

  _.each(allies, function(ally) {
    teamFinalPower += ally.finalPower;
  })

  army.allyFinalPower = teamFinalPower;

  teamFinalPower += army.finalPower;

  army.teamFinalPower = teamFinalPower;

  check(teamFinalPower, validNumber);
  return teamFinalPower;
}


BattleRound.prototype.getEnemyFinalPower = function(army) {
  var enemyFinalPower = 0;

  // call cache enemies before this
  var enemies = army.enemies;

  _.each(enemies, function(enemy) {
    enemyFinalPower += enemy.finalPower;
  })

  // store for report
  army.enemyFinalPower = enemyFinalPower;

  check(enemyFinalPower, validNumber);
  return enemyFinalPower;
}


// find enemies of unit's enemies who are unit's allies
// just getting people who are allies is not enough
BattleRound.prototype.getAllies = function(army) {
  var self = this;

  var enemies = this.getEnemies(army);
  var enemyOfEnemies = [];

  _.each(enemies, function(enemy) {
    _.each(self.getEnemies(enemy), function(enemyOfEnemy) {

      if (enemyOfEnemy._id != army._id) {

        var alreadyInArray = _.find(enemyOfEnemies, function(e) {
          return e._id == enemyOfEnemy._id;
        })

        if (!alreadyInArray) {
            enemyOfEnemies.push(enemyOfEnemy)
        }
      }
    })
  })

  return _.filter(enemyOfEnemies, function(u) {
    return army.isAlly(u)
  })
}


BattleRound.prototype.getEnemies = function(army) {
  return _.filter(this.armies, function(otherArmy) {
    return army.isEnemy(otherArmy);
  })
}



BattleRound.prototype.updateFinalPowerAllArmies = function() {
  var self = this;

  var power = 0;

  _.each(self.armies, function(army) {
    power += army.finalPower;
  })

  check(power, validNumber);
  self.finalPowerAllArmies = power;
}



BattleRound.prototype.getNumUniqueEnemyArmies = function(army) {
  var numUnique = 0;
  var playerIds = [];

  _.each(army.enemies, function(enemy) {
    if (enemy.numUnits > 0) {
      if (_.indexOf(playerIds, enemy.playerId) == -1) {
        numUnique++;
        playerIds.push(enemy.playerId);
      }
    }
  })

  check(numUnique, validNumber);
  return numUnique;
}


// includes army
BattleRound.prototype.getNumUniqueAlliedArmies = function(army) {
  var numUnique = 1;
  var playerIds = [army.playerId];

  _.each(army.allies, function(ally) {
    if (ally.numUnits > 0) {
      if (_.indexOf(playerIds, ally.playerId) == -1) {
        numUnique++;
        playerIds.push(ally.playerId);
      }
    }
  })

  check(numUnique, validNumber);
  return numUnique;
}




BattleRound.prototype.findPowerToLose = function(army) {
  var self = this;

  self.updateFinalPowerAllArmies();
  var numEnemyArmies = self.getNumUniqueEnemyArmies(army);
  var numAllyArmies = self.getNumUniqueAlliedArmies(army);
  var adjustForNumPeopleInBattle = Math.max(1, numEnemyArmies / numAllyArmies)

  var powerToLose = 0;

  if (army.dif > 0) {
    // win

    powerToLose = _s.battles.battle_power_lost_per_round + (self.finalPowerAllArmies/500)
    powerToLose = powerToLose * adjustForNumPeopleInBattle;
    powerToLose = Math.min(powerToLose, self.getEnemyFinalPower(army));
    powerToLose = powerToLose * _s.battles.battle_power_lost_winner_ratio;

  } else {
    // tie or lose

    powerToLose = _s.battles.battle_power_lost_per_round + (self.finalPowerAllArmies/500)
    powerToLose = powerToLose * adjustForNumPeopleInBattle

  }

  check(powerToLose, validNumber);
  army.powerToLose = powerToLose;
}
