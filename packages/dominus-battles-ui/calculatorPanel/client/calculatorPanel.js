Template.calculatorPanel.helpers({
  armies: function() {
    Session.get('updateCalculatorTemplates');
    return _.sortBy(calcBattle.armies, function(army) {
      return army.orderOfArrival;
    });
  },

  calcBattle: function() {
    Session.get('updateCalculatorTemplates');
    return calcBattle;
  },

  showOnCapitalCheckbox: function() {
    Session.get('updateCalculatorTemplates');
    if (!calcBattle.castle && !calcBattle.village) {
      return true;
    }
  },

  isOnCapitalChecked: function() {
    Session.get('updateCalculatorTemplates');
    return Session.get('calcOnCapital') ? 'checked' : '';
  }
});


Template.calculatorPanel.events({
  'click .onCapitalCheckbox': function(event, template) {
    var onCapitalCheckbox = template.find('.onCapitalCheckbox');
    var onCapital = $(onCapitalCheckbox).is(':checked');
    if (onCapital) {
      setOnCapital('bogusPlayerId');
    } else {
      setOnCapital(false);
    }
  },

  'click #addButton': function(event, template) {
    event.preventDefault();

    var army = new BattleArmy();
    army.orderOfArrival = calcBattle.armies.length;

    army.isOnCapital = Session.get('calcOnCapital');

    calcBattle.armies.push(army);
    calcBattle.run();
    Session.set('updateCalculatorTemplates', Math.random());
  },

  'click #addSelectedButton': function(event, template) {
    event.preventDefault();
    var selected = Session.get('selected');
    var alert = template.find('#calcBattleAlert');

    $(alert).hide();

    var data = null;
    if (selected && selected.type) {

      if (selected.type != 'castle' && selected.type != 'village' && selected.type != 'army' && selected.type != 'capital') {
        $(alert).html('Select a castle, capital, village or army.');
        $(alert).show();
        return false;
      }

      // make sure there are not more than one castle or village
      if (selected.type == 'castle' || selected.type == 'village' || selected.type == 'capital') {
        if (calcBattle.isThereABuildingInBattle()) {
          $(alert).html('Can only be one castle, capital or village in a battle.');
          $(alert).show();
          return false;
        }
      }

      var army = new BattleArmy();
      army.orderOfArrival = calcBattle.armies.length;

      if (selected.type == 'castle') {

        data = RightPanelCastle.findOne(selected.id);
        army.unitType = 'castle';
        Session.set('calcOnCapital', false);

      } else if (selected.type == 'capital') {

        data = RightPanelCapitals.findOne(selected.id);
        army.unitType = 'capital';
        Session.set('calcOnCapital', true);

      } else if (selected.type == 'village') {

        data = RightPanelVillages.findOne(selected.id);
        army.unitType = 'village';
        Session.set('calcOnCapital', false);

      } else if (selected.type == 'army') {

        data = RightPanelArmies.findOne(selected.id);
        army.unitType = 'army';

        var capital = Capitals.findOne({x:selected.x, y:selected.y});
        if (capital) {
          setOnCapital(capital.playerId);
          army.isOnCapital = true;

          if (capital.playerId == data.playerId) {
            army.isOnAllyCapital = true;
          }

        } else {
          army.isOnCapital = Session.get('calcOnCapital');
        }
      }

      // make sure unit isn't already in battle
      var dupe = false;
      _.each(calcBattle.armies, function(a) {
        if (a._id == data._id) {
          dupe = true;
        }
      })

      if (dupe) {
        $(alert).html('This unit is already in the battle.');
        $(alert).show();
        return false;
      }

      army.user_id = data.user_id;
      army.playerId = data.playerId;
      army.allies_below = [];
      army.allies_above = [];
      army.team = [];
      army.king = null;
      army.lord = null;
      army.vassals = [];
      army.is_dominus = false;
      army._id = data._id;
      army.name = data.name;
      army.isRealArmy = true;

      _s.armies.types.forEach(function(type) {
        army.units[type] = data[type];
      })

      if (army.unitType == 'castle') {
        calcBattle.castle = army;
      }

      if (army.unitType == 'village') {
        calcBattle.village = army;
      }

      if (army.unitType == 'capital') {
        calcBattle.capital = army;
      }

      calcBattle.armies.push(army);
      calcBattle.run();
      Session.set('updateCalculatorTemplates', Math.random());

    } else {
      $(alert).html('Select a castle, village or army then click add selected button.');
      $(alert).show();
    }
  }
})


Template.calculatorPanel.onCreated(function() {
  var self = this;
  Session.set('updateCalculatorTemplates', Math.random());
  calcBattle = new BattleRound();
  Session.set('calcOnCapital', false);
})

Template.calculatorPanel.onDestroyed(function() {
  delete calcBattle;
})

var setOnCapital = function(capitalPlayerId) {
  if (calcBattle.castle || calcBattle.village) {
    capitalPlayerId = false;
    Session.set('updateCalculatorTemplates', Math.random());
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
}



Template.calculatorPanel.onRendered(function() {
  this.firstNode.parentNode._uihooks = leftPanelAnimation;
})
