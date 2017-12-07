_gs.income = function(gameId, path) {

  let game = _gs.getGame(gameId);
  let settings = EJSON.clone(_s.income);

  if (game.isRelaxed) {
  }

  if (game.isSpeed) {
  }

  if (game.isCrazyFast) {
  }

  // cheats
  if (Meteor.settings.public.dominusIsDev) {
  }

  return objectValueFromString(settings, path);
}


_s.income = {
  maxToLords: 0.3,
  percentToLords: 0.06,
  sendToVassalTax: 0.2,
  incomeJobInterval: 1000 * 60 * 10
}
