Tinytest.add('battles.calculator.rounds.run', function (test) {
  var army = new BattleArmy();
  army.unitType = 'army';
  army.units = {footmen:1};

  var otherArmy = new BattleArmy();
  otherArmy.unitType = 'army';
  otherArmy.units = {archers:1};

  var round = new BattleRound();
  round.armies = [army, otherArmy];
  test.isFalse(round.battleHasRun);
  round.run();
  test.isTrue(round.battleHasRun);
});


Tinytest.add('battles.calculator.rounds.catapultBonus', function(test) {
  var army = new BattleArmy();
  army.user_id = 'army';
  army.unitType = 'army';
  army.units = {footmen:100, catapults:1};
  army.orderOfArrival = 0;

  var otherArmy = new BattleArmy();
  otherArmy.user_id = 'otherArmy';
  otherArmy.unitType = 'army';
  otherArmy.units = {archers:100, catapults:1};
  otherArmy.orderOfArrival = 1;

  var round = new BattleRound();
  round.armies = [army, otherArmy];
  round.run();
  test.equal(army.unitBonus.catapults, 0);
  test.equal(otherArmy.unitBonus.catapults, 0);

  round.capital = {user_id:'army'};
  round.run();
  test.equal(army.unitBonus.catapults, 0);
  test.equal(otherArmy.unitBonus.catapults, _s.armies.stats.catapults.bonus_against_buildings);
})


Tinytest.add('battles.calculator.rounds.villageDestroyed', function(test) {
  var village = new BattleArmy();
  village.user_id = 'army';
  village.unitType = 'village';
  village.units = {footmen:2};
  village.orderOfArrival = 0;

  var otherArmy = new BattleArmy();
  otherArmy.user_id = 'otherArmy';
  otherArmy.unitType = 'army';
  otherArmy.units = {footmen:200};
  otherArmy.orderOfArrival = 1;

  var round = new BattleRound();
  round.armies = [village, otherArmy];
  round.run();

  // village destroyed
  test.isTrue(village.destroyed);
  test.isFalse(otherArmy.destroyed);

  // villages survives
  village.units = {footmen:200};
  otherArmy.units = {footmen:2};
  round.run();
  test.isFalse(village.destroyed);
  test.isTrue(otherArmy.destroyed);

  // multiple rounds
  otherArmy.units = {footmen:200};
  round.run();
  test.isFalse(village.destroyed);
  test.isFalse(otherArmy.destroyed);
})


Tinytest.add('battles.calculator.rounds.villageDestroyed3Armies', function(test) {
  var village = new BattleArmy();
  village.playerId = 'village';
  village.unitType = 'village';
  village.units = {};
  village.orderOfArrival = 0;

  var otherArmy = new BattleArmy();
  otherArmy.playerId = 'otherArmy';
  otherArmy.unitType = 'army';
  otherArmy.units = {footmen:200};
  otherArmy.orderOfArrival = 1;

  var anotherArmy = new BattleArmy();
  anotherArmy.playerId = 'anotherArmy';
  anotherArmy.unitType = 'army';
  anotherArmy.units = {footmen:200};
  anotherArmy.orderOfArrival = 2;

  var round = new BattleRound();
  round.armies = [village, otherArmy, anotherArmy];
  round.run();
  test.isFalse(otherArmy.destroyed);
  test.isFalse(anotherArmy.destroyed);
  test.isTrue(village.destroyed);

  // village above both but not dominus
  village.allies_below = ['otherArmy', 'anotherArmy'];
  village.team = ['otherArmy', 'anotherArmy', 'village'];
  village.vassals = ['otherArmy', 'anotherArmy'];
  village.is_dominus = false;

  otherArmy.allies_above = ['village'];
  otherArmy.team = ['otherArmy', 'anotherArmy', 'village'];
  otherArmy.king = 'village';
  otherArmy.lord = 'village';

  anotherArmy.allies_above = ['village'];
  anotherArmy.team = ['otherArmy', 'anotherArmy', 'village'];
  anotherArmy.king = 'village';
  anotherArmy.lord = 'village';

  round.run();
  test.isFalse(otherArmy.destroyed);
  test.isFalse(anotherArmy.destroyed);
  test.equal(village.allies.length, 0, 'village shoud have zero allies');
  test.equal(village.enemies.length, 0, 'village should have zero enemies');
  test.isFalse(village.destroyed, 'village above both should not be destroyed');

  // village above one, not dominus
  village.allies_below = ['otherArmy'];
  village.team = ['otherArmy', 'village'];
  village.vassals = ['otherArmy'];
  village.is_dominus = false;

  otherArmy.allies_above = ['village'];
  otherArmy.team = ['otherArmy', 'village'];
  otherArmy.king = 'village';
  otherArmy.lord = 'village';

  anotherArmy.allies_above = [];
  anotherArmy.team = [];
  anotherArmy.king = null;
  anotherArmy.lord = null;

  round.run();
  test.isFalse(otherArmy.destroyed);
  test.isFalse(anotherArmy.destroyed);
  test.equal(village.allies.length, 1, 'village should have one ally');
  test.equal(village.enemies.length, 1, 'village should have one enemy');
  test.isTrue(village.destroyed, 'village above one');
})
