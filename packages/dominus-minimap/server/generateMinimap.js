Minimap.imageSavePathMinimap = 'minimap/';




if (process.env.DOMINUS_WORKER == 'true') {
  Queues.generateAllMinimaps.process(async function(job) {
    for (const game of await Games.find({hasStarted:true, hasClosed:false}).fetchAsync()) {
      await Queues.addAsyncOrLog('generateGameMinimap', {gameId:game._id}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, game._id);
    }
  });
}






if (process.env.DOMINUS_WORKER == 'true') {
  Queues.generateGameMinimap.process(async function(job) {
    await Minimap.updateMapSizeSetting(job.data.gameId);
    var res = await Minimap.generateMinimap(job.data.gameId);
    if (!res) {
      throw new Error(res);
    }
  });
}


Minimap.generateMinimap = async function(gameId) {
  check(gameId, String);
  var self = this;

  var simplify = Npm.require('simplify-js');

  var game = await Games.findOneAsync(gameId, {fields: {map_size:1}});
  if (!game) {
    console.error('No game found in generateMinimap', gameId);
    return false;
  }

  var ratio = Minimap.minimapSizeRatio(game.map_size);
  var hexSize = _s.init.hexSize * ratio;
  var offset = Minimap.minimapOffset(game.map_size, hexSize);

  var svg = [];

  for (const country of await Countries.find({gameId:gameId}, {fields: {paths:1}}).fetchAsync()) {
    let countrySvg = [];

    if (country.paths) {
      country.paths.forEach(function(path) {
        let points = '';

        path = simplify(path, 40, true);

        path.forEach(function(point) {
          point.x = point.x * ratio;
          point.y = point.y * ratio
          point.x += _s.minimap.minimapContainerSize/2;
          point.y += _s.minimap.minimapContainerSize/2;
          point.x = Math.round((point.x + offset.x) * 100) / 100;
          point.y = Math.round((point.y + offset.y) * 100) / 100;
          points += ' '+point.x+','+point.y;
        })

        countrySvg.push({points:points});
      });
    }

    svg.push({country:countrySvg});
  }

  await Games.updateAsync(gameId, {$set: {minimap: svg}});
  return true;
}
