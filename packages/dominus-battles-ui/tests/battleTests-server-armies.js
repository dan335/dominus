// var castleFields = {name:1, user_id:1, x:1, y:1, username:1, image:1};
// var armyFields = {name:1, user_id:1, x:1, y:1, last_move_at:1, username:1, castle_x:1, castle_y:1, castle_id:1};
// var villageFields = {name:1, user_id:1, x:1, y:1, username:1, castle_x:1, castle_y:1, castle_id:1};
//
// var army =  new BattleArmy();
// army.unitType = 'army';


Tinytest.add('battles.calculator.armies.isEnemy', function (test) {
  var army = new BattleArmy();
  army.unitType = 'army';

  var otherArmy = new BattleArmy();
  otherArmy.unitType = 'army';

  test.isTrue(army.isEnemy(otherArmy));

  army.lord = otherArmy.playerId;
  army.team = [otherArmy.playerId];
  army.allies_above = [otherArmy.playerId];
  test.isFalse(army.isEnemy(otherArmy));
});
