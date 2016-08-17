

// if (process.env.DOMINUS_WORKER == 'true') {
//   let query = Armypaths.find({countryIds:null}, {fields: {gameId:1, countryIds:1, x:1, y:1, index:1, armyId:1}});
//   query.observe({
//     added: function(path) {
//       Queues.add('findCountriesInPath', {path:path}, {attempts:10, backoff:{type:'fixed', delay:3000}, delay:0, timeout:1000*60*3}, path._id);
//     },
//     changed: function(oldPath, newPath) {
//       if (!newPath.countryIds) {
//         Queues.add('findCountriesInPath', {path:newPath}, {attempts:10, backoff:{type:'fixed', delay:3000}, delay:0, timeout:1000*60*3}, newPath._id);
//       }
//     }
//   });
// }


if (process.env.DOMINUS_WORKER == 'true') {
  Queues.findCountriesInPath.process(4, Meteor.bindEnvironment(function(job) {
    Mappather.findCountriesInPath(job.data.path);
    return Promise.resolve();
  }));
}


Mappather.findCountriesInPath = function(path) {
  check(path._id, String);
  check(path.x, validNumber);
  check(path.y, validNumber);
  check(path.gameId, String);
  check(path.armyId, String);

  let fromX = null;
  let fromY = null;
  if (path.index == 0) {
    const army = Armies.findOne(path.armyId, {fields: {x:1, y:1}});
    if (!army) {
      Armypaths.remove({armyId:path.armyId});
      return false;
    }
    fromX = army.x;
    fromY = army.y;
  } else {
    //const lastPath = Armypaths.find({armyId:path.armyId, index:{$lt:path.index}}, {sort: {index:-1}, limit:1, fields: {x:1, y:1}}).fetch()[0];
    const lastPath = Armypaths.findOne({armyId:path.armyId, index:path.index-1}, {fields: {x:1, y:1}});
    if (!lastPath) {
      // indexes are wrong somehow, re-index
      Queues.add('fixPathIndexes', {armyId:path.armyId}, {delay:500, timeout:1000*60}, false);
      //console.error('No lastpath found in findCountriesInPath', path);
      return false;
    }
    fromX = lastPath.x;
    fromY = lastPath.y;
  }

  const fromCountryId = Mapmaker.coordsToCountryId(path.gameId, fromX, fromY);
  const toCountryId = Mapmaker.coordsToCountryId(path.gameId, path.x, path.y);

  if (fromCountryId == toCountryId) {
    path.countryIds = [fromCountryId];
  } else {
    //let nodes = countryNeighbors[path.gameId];
    const countryFields = {neighbors:1};
    const nodes = Countries.find({gameId:path.gameId}, {fields:countryFields}).fetch();

    if (!nodes) {
      console.error('no nodes found.');
      return false;
    }

    path.countryIds = pathfind(nodes, fromCountryId, toCountryId);
  }

  Armypaths.update(path._id, {$set: {countryIds:path.countryIds}});
}





var pathfind = function(nodes, fromCountryId, toCountryId) {
  var endNode = _.find(nodes, function(n) {
    return n._id == toCountryId;
  })

  var beginNode = _.find(nodes, function(n) {
    return n._id == fromCountryId;
  })

  var openList = [beginNode];
  var closedList = [];

  var cf = {};
  cf[fromCountryId] = null;
  var cameFrom = [cf];

  var fScore = {};
  var gScore = {};

  // set default scores
  nodes.forEach(function(node) {
    fScore[node._id] = Infinity;
    gScore[node._id] = Infinity;

    if (node._id == fromCountryId) {
      gScore[node._id] = 0;
      fScore[node._id] = heuristicCostEstimate(node, endNode);
    }
  });

  var current;
  var neighbors;

  while (openList.length) {

    // get lowest fscore in openList
    current = lowestFscore(fScore, openList);

    // if at destination finish
    if (current._id == toCountryId) {
      return reconstructPath(cameFrom, current, nodes);
    }

    // remove current from openList
    openList = _.reject(openList, function(node) {
      return node._id == current._id;
    })

    // add current to closedList
    closedList.push(current);

    // check neighbors
    neighbors = getNeighbors(current, nodes);
    _.each(neighbors, function(neighbor) {

      // skip if in closedList
      var inClosedList = _.find(closedList, function(cl) {
        return neighbor._id == cl._id;
      })

      if (!inClosedList) {
        //var dist = Hx.hexDistance(current.x, current.y, neighbor.x, neighbor.y);
        var heuristic = getHeuristic(current, neighbor);
        var tentativeGscore = gScore[current._id] + heuristic;

        var inOpenList = _.find(openList, function(ol) {
          return neighbor._id == ol._id;
        })

        if (!inOpenList || tentativeGscore < gScore[neighbor._id]) {
          cameFrom[neighbor._id] = current._id;
          gScore[neighbor._id] = tentativeGscore;
          fScore[neighbor._id] = tentativeGscore + heuristicCostEstimate(neighbor, endNode);

          var neighborInOpenList = _.find(openList, function(ol) {
            return neighbor._id == ol._id;
          });
          if (!neighborInOpenList) {
            openList.push(neighbor);
          }
        }
      }
    })
  }

  console.log('fail countrypather', fromCountryId, toCountryId)
  return false;
}




var reconstructPath = function(cameFrom, current, nodes) {
  var currentId = current._id;
  var totalPathIds = [];

  while (currentId) {
    totalPathIds.push(currentId);
    currentId = cameFrom[currentId];
  }

  var totalPath = [];

  _.each(totalPathIds, function(id) {
    var node = _.find(nodes, function(n) {
      return n._id == id;
    });
    totalPath.push(node._id);
  })

  return totalPath;
}





var lowestFscore = function(fScore, nodes) {
  var smallest = Infinity;
  var smallestNode = null;

  _.each(nodes, function(node) {
    if (fScore[node._id] < smallest) {
      smallestNode = node;
      smallest = fScore[node._id];
    }
  })

  return smallestNode;
}


var heuristicCostEstimate = function(from, to) {
  // let min = Hx.hexDistance(from.minX, from.minY, to.minX, to.minY);
  // let max = Hx.hexDistance(from.maxX, from.maxY, to.maxX, to.maxY);
  // return (min + max) / 2;
  return 1;
}



var getNeighbors = function(current, nodes) {
  return _.filter(nodes, function(node) {
    return _.contains(current.neighbors, node._id);
  });
}



var getHeuristic = function(current, neighbor) {
  return 1;
}


//
//
// var observeHandles = {};
// var countryFields = {neighbors:1, minX:1, maxX:1, minY:1, maxY:1, minZ:1, maxZ:1};
// countryNeighbors = {};
//
// if (process.env.DOMINUS_WORKER == 'true') {
//
//   // store each country's neighors in memory
//   Games.find({hasStarted:true, hasClosed:false}, {fields: {_id:1}}).observe({
//     added(game) {
//
//       let query = Countries.find({gameId:game._id}, {fields:countryFields});
//       observeHandles[game._id] = query.observe({
//         added(doc) {
//           if (!countryNeighbors.hasOwnProperty(game._id)) {
//             countryNeighbors[game._id] = [];
//           }
//           countryNeighbors[game._id].push(doc);
//         },
//         changed(newDoc, oldDoc) {
//           countryNeighbors[game._id] = _.reject(countryNeighbors[game._id], function(country) {
//             return country._id == oldDoc._id;
//           });
//           countryNeighbors[game._id].push(newDoc);
//         },
//         removed(oldDoc) {
//           countryNeighbors[game._id] = _.reject(countryNeighbors[game._id], function(country) {
//             return country._id == oldDoc._id;
//           });
//         }
//       });
//
//     },
//     removed(game) {
//       observeHandles[game._id].stop();
//     }
//   });
//
// }
