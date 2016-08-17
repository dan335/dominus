// no longer used

// fields sent to client
//var countryFields = {hexes:1, minX:1, maxX:1, minY:1, maxY:1, numHexes:1, paths:1, image:1, imageWithCoords:1};
// var countryFields = {minX:1, maxX:1, minY:1, maxY:1, numHexes:1, paths:1, image:1, imageWithCoords:1};
//
// Meteor.publish("countriesOnScreen", function (x, y, numHexesHigh, numHexesDiag) {
//   check(x, Match.Integer);
//   check(y, Match.Integer);
//   check(numHexesHigh, validNumber);
//   check(numHexesDiag, validNumber);
//
//   var z = -1 * x - y;
//
//   // decrease to send more countries to client
//   // start at 2, decrease until countries on screen are always loaded
//   var num = 1.2;
//
//   var find = {
//     minX: {$lte: x + numHexesDiag / num},
//     maxX: {$gte: x - numHexesDiag / num},
//     minY: {$lte: y + numHexesHigh / num},
//     maxY: {$gte: y - numHexesHigh / num},
//     minZ: {$lte: z + numHexesDiag / num},
//     maxZ: {$gte: z - numHexesDiag / num}
//   }
//
//   return Countries.find(find, {fields: countryFields});
// });
