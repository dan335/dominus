Shorefinder = {


  // can be 0 - 5
  waterDirection: function(hex) {
    check(hex.gameId, String);

    for (d=0; d<6; d++) {
      var coord = Hx.getNeighbor(hex.x, hex.y, d);
      if (!Hexes.find({gameId:hex.gameId, x:coord.x, y:coord.y}).count()) {
        return d;
      }
    }
    return false;
  },
}
