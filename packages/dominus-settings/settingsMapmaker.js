_gs.mapmaker = function(gameId, path) {

  let game = _gs.getGame(gameId);
  let settings = EJSON.clone(_s.mapmaker);

  if (game.isNoLargeResources) {
    settings.large = 0;
  }

  // cheats
  if (Meteor.settings.public.dominusIsDev) {
  }

  return objectValueFromString(settings, path);
}

_s.mapmaker = {
  minimapResolution: 3,   // 3 = keep every 3rd hex, higher = better perf
  minimapMaxPoints: 200,
  nearbyBuildingCheckRadius: 5,
  minHexesInCountry: 100,
  maxHexesInCountry: 300,
  hexSize: 60,  // this should be in settings package
  hexSquish: 0.7,  // this should be in settings package

  // hex generation chances
  grain_min: 0,
  grain_max: 0.5,
  lumber_min: 0.5,
  lumber_max: 0.6111,
  ore_min: 0.6111,
  ore_max: 0.7222,
  wool_min: 0.7222,
  wool_max: 0.8333,
  clay_min: 0.8333,
  clay_max: 0.9444,
  glass_min: 0.9444,
  glass_max: 1,
  large: 0.1, 		// x% chance to be a large resource hex

  // which image to use for hex
  // this is how many are available
  numTileImages: {
    grain: 3,
    lumber: 1,
    ore: 1,
    wool: 1,
    clay: 1,
    glass: 1
  }

}
