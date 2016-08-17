Minimap.minimapOffset = function(map_size, minimapHexSize) {
  var miniDistanceBetween = Hx.distanceBetweenHexes(minimapHexSize, _s.init.hexSquish);

  // vertical
  var hexesAcrossY = map_size.maxY - map_size.minY;
  var hexesAcrossBg = _s.minimap.minimapContainerSize / minimapHexSize;
  var yHexOffset = 0//(map_size.maxY - map_size.minY) / 2 * -1; //(hexesAcrossBg / 2 + hexesAcrossY / 2) * -1;

  // horizontal
  centerHexX = map_size.maxX - map_size.minX;
  centerHexZ = map_size.maxZ - map_size.minZ;

  var leftMostHex = Math.max(Math.abs(map_size.minX), Math.abs(map_size.maxZ));
  var rightMostHex = Math.max(Math.abs(map_size.maxX), Math.abs(map_size.minZ));

  var horizHexOffset = (leftMostHex - rightMostHex) / 2; //hexesAcrossBg / 2 + centerHexX * -1;
  //
  // if (leftMostHex > rightMostHex) {
  //   horizHexOffset = horizHexOffset * -1;
  // }

  var offset = {
    x: horizHexOffset * miniDistanceBetween.horiz,
    y: yHexOffset * miniDistanceBetween.vert
  }

  return offset;
}



Minimap.minimapSizeRatio = function(map_size) {
  check(map_size, {
    minX: validNumber,
    maxX: validNumber,
    minY: validNumber,
    maxY: validNumber,
    minZ: validNumber,
    maxZ: validNumber
  });

  var numHexesY = Math.abs(map_size.minY) + Math.abs(map_size.maxY);
  var vertDistance = Hx.distanceBetweenHexes(_s.init.hexSize, _s.init.hexSquish).vert * numHexesY;

  var leftMostHex = Math.max(Math.abs(map_size.minX), Math.abs(map_size.maxZ));
  var rightMostHex = Math.max(Math.abs(map_size.maxX), Math.abs(map_size.minZ));
  var horizDistance = Hx.distanceBetweenHexes(_s.init.hexSize, _s.init.hexSquish).horiz * (leftMostHex + rightMostHex);

  var distance = Math.max(vertDistance, horizDistance) * 1.1; // 1.1 is to give a little extra space
  var ratio = _s.minimap.minimapContainerSize / distance;

  return ratio;
}
