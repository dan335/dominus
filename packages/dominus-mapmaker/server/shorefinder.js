Shorefinder = {


  // can be 0 - 5
  waterDirection: async function(hex) {
    check(hex.gameId, String);

    for (d=0; d<6; d++) {
      var coord = Hx.getNeighbor(hex.x, hex.y, d);
      if (!await Hexes.find({gameId:hex.gameId, x:coord.x, y:coord.y}).countAsync()) {
        return d;
      }
    }
    return false;
  },
}
