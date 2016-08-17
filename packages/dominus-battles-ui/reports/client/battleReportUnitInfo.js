Template.battleReportUnitInfo.helpers({
  army: function() {
    var army = Template.currentData();
    if (army) {
      return army;
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

  isArmy: function() {
    var army = Template.currentData();
    if (army && army.unitType) {
      return army.unitType == 'army';
    }
  },

  won: function() {
    var army = Template.currentData();
    if (army) {
      return army.dif > 0;
    }
  },

  soldiersLost: function() {
    var army = Template.currentData();
    if (army && army.loses) {
      var loses = 0;

      _s.armies.types.forEach(function(type) {
        loses += army.loses[type];
      })

      return loses;
    }
  },

  powerLost: function() {
    var army = Template.currentData();
    if (army && army.loses) {
      var power = 0;

      _s.armies.types.forEach(function(type) {
        power += army.loses[type] * army.finalPowerPerSoldier[type];
      })

      return power;
    }
  },
})
