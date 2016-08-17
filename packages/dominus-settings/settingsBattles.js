_gs.battles = function(gameId, path) {

  let game = _gs.getGame(gameId);
  let settings = EJSON.clone(_s.battles);

  if (game.isSpeed) {
    settings.battleInterval = 1000 * 60;
  }

  if (game.isSuperSpeed) {
    settings.battleInterval = 1000 * 30;
  }

  // cheats
  if (Meteor.settings.public.dominusIsDev) {
    settings.battleInterval = 1000 * 10;
  }

  return objectValueFromString(settings, path);
}



_s.battles = {
  battleInterval: 1000 * 60 * 4,
  battleCheckInterval: 1000 * 20,
  unitBonusMultiplier: 1.5,
  battle_power_lost_per_round: 500,
  battle_power_lost_winner_ratio: 0.4
}
