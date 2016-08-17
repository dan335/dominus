Minimap.updateMapSizeSetting = function(gameId) {
  var minX = Hexes.findOne({gameId:gameId, isBorder:true}, {fields:{x:1}, sort:{x:1}});
  var maxX = Hexes.findOne({gameId:gameId, isBorder:true}, {fields:{x:1}, sort:{x:-1}});
  var minY = Hexes.findOne({gameId:gameId, isBorder:true}, {fields:{y:1}, sort:{y:1}});
  var maxY = Hexes.findOne({gameId:gameId, isBorder:true}, {fields:{y:1}, sort:{y:-1}});
  var minZ = Hexes.findOne({gameId:gameId, isBorder:true}, {fields:{z:1}, sort:{z:1}});
  var maxZ = Hexes.findOne({gameId:gameId, isBorder:true}, {fields:{z:1}, sort:{z:-1}});

  var map_size = {
    minX: minX ? minX.x : null,
    maxX: maxX ? maxX.x : null,
    minY: minY ? minY.y : null,
    maxY: maxY ? maxY.y : null,
    minZ: minZ ? minZ.z : null,
    maxZ: maxZ ? maxZ.z : null
  }

  Games.update(gameId, {$set: {map_size:map_size}});
}


// Meteor.startup(function() {
//   if (process.env.DOMINUS_WORKER == 'true') {
//     Games.find({hasEnded:false}, {fields:{_id:1}}).forEach(function(game) {
//       Minimap.updateMapSizeSetting(game._id);
//     })
//   }
// })
