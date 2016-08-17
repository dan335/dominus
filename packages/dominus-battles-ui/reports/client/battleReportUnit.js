Template.battleReportUnit.helpers({
  icon_name: function() {
    if (this.isAttacker) {
      return 'fa-gavel';
    } else {
      return 'fa-shield';
    }
  },

  unitNum: function() {
    var army = Template.parentData(1);

    if (army && army.units) {
      return army.units[this];
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

  loses: function() {
    var army = Template.parentData(1);

    if (army && army.loses) {
      return army.loses[this];
    }
  },

  basePowerType: function() {
    var army = Template.parentData(1);

    if (army && army.loses) {
      return army.basePower[this];
    }
  },

  unitBonusType: function() {
    var army = Template.parentData(1);

    if (army && army.loses) {
      return army.unitBonus[this];
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

  numSoldiers: function() {
    var army = Template.currentData();
    if (army) {
      var num = 0;

      _s.armies.types.forEach(function(type) {
        num += army.units[type];
      })

      return num;
    }
  },
})



Template.battleReportUnit.events({
  'click .battleReportGotoUser': function(event, template) {
    event.preventDefault();
    var data = Template.currentData();
    var selected = {type:'castle'};

    if (data.unitType == 'castle') {
      selected.x = data.x;
      selected.y = data.y;
      selected.id = data._id;
    } else {
      selected.x = data.castle_x;
      selected.y = data.castle_y;
      selected.id = data.castle_id;
    }
    dInit.select('castle', selected.x, selected.y, selected.id);
    dHexmap.centerOnHex(selected.x, selected.y);
  }
})
