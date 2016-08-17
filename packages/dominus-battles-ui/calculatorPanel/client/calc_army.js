Template.calculatorArmy.helpers({
  _sArmies: function() {
    return _s.armies;
  },

  unitNum: function() {
    var army = Template.parentData(1);

    if (army && army.units) {
      return army.units[this];
    }
  },

  isTypeSelected: function(type) {
    if (type == this.unitType) {
      return 'active';
    }
  },

  isCastle: function() {
    var army = Template.currentData();
    if (army && army.unitType) {
      return army.unitType == 'castle';
    }
  },

  isVillage: function() {
    var army = Template.currentData();
    if (army && army.unitType) {
      return army.unitType == 'village';
    }
  },

  isCapital: function() {
    var army = Template.currentData();
    if (army && army.unitType) {
      return army.unitType == 'capital';
    }
  },

  isArmy: function() {
    var army = Template.currentData();
    if (army && army.unitType) {
      return army.unitType == 'army';
    }
  },

  loses: function() {
    var army = Template.parentData(1);

    if (army && army.loses) {
      return army.loses[this];
    }
  },

  basePower: function() {
    var army = Template.parentData(1);

    if (army && army.loses) {
      return army.basePower[this];
    }
  },

  unitBonus: function() {
    var army = Template.parentData(1);

    if (army && army.loses) {
      return army.unitBonus[this];
    }
  },

  won: function() {
    var army = Template.currentData();
    if (army) {
      return army.dif > 0;
    }
  },

  powerLost: function() {
    var army = Template.currentData();
    if (army && army.loses) {
      var power = 0;

      _.each(s.army.types, function(type) {
        power += army.loses[type] * army.finalPowerPerSoldier[type];
      })

      return power;
    }
  },

  soldiersLost: function() {
    var army = Template.currentData();
    if (army && army.loses) {
      var loses = 0;

      _.each(s.army.types, function(type) {
        loses += army.loses[type];
      })

      return loses;
    }
  },

  numSoldiers: function() {
    var army = Template.currentData();
    if (army) {
      var num = 0;

      _.each(s.army.types, function(type) {
        num += army.units[type];
      })

      return num;
    }
  },

  hasEnemies: function() {
    var army = Template.currentData();
    if (army) {
      return army.enemies.length > 0;
    }
  },

  hasAllies: function() {
    var army = Template.currentData();
    if (army) {
      return army.allies.length > 0;
    }
  },

  hasSoldiers: function() {
    var army = Template.currentData();
    if (army) {
      return army.finalPower > 0;
    }
  },

  isOnAllyCapitalChecked: function() {
    Session.get('updateCalculatorTemplates');
    var army = Template.currentData();
    if (army) {
      return army.isOnAllyCapital ? 'checked' : '';
    }
  },

  player: function() {
    var army = Template.currentData();
    if (army) {
      var fields = {username:1};
      var player = Calcplayers.findOne(army.playerId, {fields:fields});
      if (player) {
        return player;
      }
    }
  }
})


Template.calculatorArmy.events({

  'click .onAllyCapitalCheckbox': function(event, template) {
    var onAllyCapitalCheckbox = template.find('.onAllyCapitalCheckbox');
    var onAllyCapital = $(onAllyCapitalCheckbox).is(':checked');
    if (onAllyCapital) {
      var army = Template.currentData();
      setOnCapital(army.playerId);
    } else {
      setOnCapital('bogusPlayerId');
    }
  },

  'input .armyUnitInput': function(event, template) {
    var type = event.currentTarget.getAttribute('data-type');
    var army = Template.currentData();
    var num = parseInt(event.currentTarget.value);

    if (isNaN(num)) {
      return;
    }

    if (num < 0) {
      return;
    }

    army.units[type] = num;

    updateArmy(army);
  },

  'click .unitTypeButton': function(event, template) {
    event.preventDefault();
    var type = event.currentTarget.getAttribute('data-type');
    var alert = template.find('.calcArmyAlert');
    var army = Template.currentData();

    $(alert).hide();
    calcBattle.castle = null;
    calcBattle.village = null;

    // remove isOnCapital if not unitType army
    if (type != 'army') {
      setOnCapital(false);
      army.isOnCapital = false;
      army.isOnAllyCapital = false;
    }

    // make sure there isn't more than one castle or village
    var foundCastleOrVillage = false;
    if (type == 'castle' || type == 'village') {
      _.each(calcBattle.armies, function(a) {
        if (a._id != army._id) {
          if (a.unitType == 'castle' || a.unitType == 'village') {
            foundCastleOrVillage = true;
          }
        }
      })
    }

    if (foundCastleOrVillage) {
      $(alert).html('Can only be one castle or village in a battle.');
      $(alert).show();
    } else {
      army.unitType = type;

      // fill in castle or village
      if (type == 'castle') {
        var data = {name:'asdf', playerId:army.playerId, x:1, y:1, username:'asdf'};
        calcBattle.castle = data;
      } else if (type == 'village') {
        var data = {name:'asdf', playerId:army.playerId, x:1, y:1, username:'asdf', castle_x:1, castle_y:1, castle_id:12345};
        calcBattle.village = data;
      }

      updateArmy(army);
    }
  },

  'click .removeArmyButton': function(event, template) {
    event.preventDefault();
    var army = Template.currentData();
    removeArmy(army);
  },

  'click .armyUpButton': function(event, template) {
    event.preventDefault();
    var army = Template.currentData();
    moveArmyUp(army);
  },

  'click .armyDownButton': function(event, template) {
    event.preventDefault();
    var army = Template.currentData();
    moveArmyDown(army);
  }
})


// subtract 1.5, when battle is run orderOfArrival is cleaned up
var moveArmyUp = function(army) {
  army.orderOfArrival -= 1.5;
  updateArmy(army);
}

var moveArmyDown = function(army) {
  army.orderOfArrival += 1.5;
  updateArmy(army);
}


var removeArmy = function(army) {
  var armies = _.reject(calcBattle.armies, function(a) {
    return a._id == army._id;
  })
  calcBattle.armies = armies;
  Session.set('runCalcBattle', Math.random());
}

var updateArmy = function(army) {
  var armies = _.reject(calcBattle.armies, function(a) {
    return a._id == army._id;
  })
  armies.push(army);
  calcBattle.armies = armies;
  Session.set('runCalcBattle', Math.random());
}



Template.calculatorArmy.onRendered(function() {
  this.firstNode.parentNode._uihooks = battleCalculatorAnimation;
})


Template.calculatorArmy.onCreated(function() {

  var self = this;
  self.army = Template.currentData();
  self.subscribe('calcPlayer', self.army.playerId);

  self.autorun(function() {
    Session.get('runCalcBattle');

    if (self.army.isRealArmy) {
      if (Template.instance().subscriptionsReady()) {
        calcBattle.run();
        Session.set('updateCalculatorTemplates', Math.random());
      }
    } else {
      calcBattle.run();
      Session.set('updateCalculatorTemplates', Math.random());
    }
  });
})


var setOnCapital = function(capitalPlayerId) {
  if (calcBattle.castle || calcBattle.village) {
    capitalPlayerId = false;
  }

  if (capitalPlayerId) {
    Session.set('calcOnCapital', true);
    calcBattle.capital = {playerId:capitalPlayerId};
  } else {
    Session.set('calcOnCapital', false);
    calcBattle.capital = null;
  }

  calcBattle.armies = _.map(calcBattle.armies, function(a) {
    a.isOnCapital = false;
    a.isOnAllyCapital = false;

    if (capitalPlayerId) {
      a.isOnCapital = true;
      if (a.playerId == capitalPlayerId) {
        a.isOnAllyCapital = true;
      }
    }
    return a;
  });

  Session.set('runCalcBattle', Math.random());
  Session.set('updateCalculatorTemplates', Math.random());
}
