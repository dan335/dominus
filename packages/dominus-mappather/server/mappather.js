// if (process.env.DOMINUS_WORKER == 'true') {
//   let query = Armypaths.find({countryIds:{$ne:null}, hexes:null});
//   query.observe({
//     added: function(path) {
//       Queues.add('pathToHex', {path:path}, {delay:0, timeout:1000*60*3}, path._id);
//     },
//     changed: function(oldPath, newPath) {
//       Queues.add('pathToHex', {path:newPath}, {delay:0, timeout:1000*60*3}, newPath._id);
//     }
//   });
// }

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.pathToHex.process(4, Meteor.bindEnvironment(function(job) {
    Mappather.pathToHex(job.data.path);
    return Promise.resolve();
  }));
}


Mappather.pathToHex = function(path) {

  var nodes = Hexes.find({countryId: {$in:path.countryIds}}, {fields: {x:1, y:1, hasBuilding:1, countryId:1}});
  if (!nodes.count()) {
    console.error('No nodes found in pathToHex', path);
    return false;
  }

  let fromX = null;
  let fromY = null;
  if (path.index == 0) {
    let army = Armies.findOne(path.armyId, {fields: {x:1, y:1}});
    if (!army) {
      //console.error('No army found in pathToHex', path);
      Armypaths.remove(path._id);
      return false;
    }
    fromX = army.x;
    fromY = army.y;
  } else {
    const lastPath = Armypaths.findOne({armyId:path.armyId, index:path.index-1}, {fields: {x:1, y:1}});
    if (!lastPath) {
      // indexes are wrong, re-index
      Queues.add('fixPathIndexes', {armyId:path.armyId}, {delay:500, timeout:1000*60}, false);
      return false;
    }
    fromX = lastPath.x;
    fromY = lastPath.y;
  }

  //console.time('getPath '+path.countryIds.length);
  let distance = 0;
  let hexes = Mappather.getPath(fromX, fromY, path.x, path.y, nodes.fetch());

  if (!hexes) {
    // path not found
    // remove because it errors endlessly
    Armypaths.remove(path._id);
    return false;
    //hexes = null;
    //distance = 0;
  }

  //console.timeEnd('getPath '+path.countryIds.length);
  distance = hexes.length;
  Armypaths.update(path._id, {$set: {hexes:hexes, distance:distance, dirtyMoveTotals:true}});
}


// replacement for pathTo

Mappather.getPath = function(startX, startY, endX, endY, nodes) {
  check(startX, Match.Integer);
  check(startY, Match.Integer);
  check(endX, Match.Integer);
  check(endY, Match.Integer);
  check(nodes, [Match.ObjectIncluding({_id:String, x:Match.Integer, y:Match.Integer, hasBuilding:Boolean})]);

  var self = this;

  if (startX == endX && startY == endY) {
    return [];
  }

  var startNode = self.getStartNode(startX, startY, nodes);

  if (!startNode) {
    console.log('start node not found in getPath', startX, startY);
    return false;
  }

  var openList = [startNode];
  var closedList = [];

  var cf = {};
  cf[startNode._id] = null;
  var cameFrom = [cf];

  var fScore = {};
  var gScore = {};

  // set default scores
  nodes.forEach(function(node) {
    fScore[node._id] = Infinity;
    gScore[node._id] = Infinity;

    if (node.x == startX && node.y == startY) {
      gScore[node._id] = 0;
      fScore[node._id] = self.heuristicCostEstimate(startX, startY, endX, endY);
    }
  });

  var current;
  var neighbors;

  while (openList.length) {

    // get lowest fscore in openList
    current = self.lowestFscore(fScore, openList);

    // if at destination finish
    if (current.x == endX && current.y == endY) {
      return self.reconstructPath(cameFrom, current, nodes);
    }

    // remove current from openList
    openList = _.reject(openList, function(node) {
      return node._id == current._id;
    })

    // add current to closedList
    closedList.push(current);

    // check neighbors
    neighbors = self.getNeighbors(current.x, current.y, nodes);
    _.each(neighbors, function(neighbor) {

      // skip if in closedList
      var inClosedList = _.find(closedList, function(cl) {
        return neighbor._id == cl._id;
      })

      if (!inClosedList) {
        //var dist = Hx.hexDistance(current.x, current.y, neighbor.x, neighbor.y);
        var heuristic = self.heuristic(current, neighbor);
        var tentativeGscore = gScore[current._id] + heuristic;

        var inOpenList = _.find(openList, function(ol) {
          return neighbor._id == ol._id;
        })

        if (!inOpenList || tentativeGscore < gScore[neighbor._id]) {
          cameFrom[neighbor._id] = current._id;
          gScore[neighbor._id] = tentativeGscore;
          fScore[neighbor._id] = tentativeGscore + self.heuristicCostEstimate(neighbor.x, neighbor.y, endX, endY);

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
  console.log('fail', startX, startY, endX, endY)
  return false;
}



Mappather.getStartNode = function(startX, startY, nodes) {
  return _.find(nodes, function(node) {
    return node.x == startX && node.y == startY;
  })
}



Mappather.heuristicCostEstimate = function(startX, startY, endX, endY) {
  //return Hx.hexDistance(startX, startY, endX, endY);

  var from_pos = Hx.coordinatesToPos(startX, startY, _s.init.hexSize, _s.init.hexSquish)
  var to_pos = Hx.coordinatesToPos(endX, endY, _s.init.hexSize, _s.init.hexSquish)
  return Math.sqrt( (to_pos.x-=from_pos.x)*to_pos.x + (to_pos.y-=from_pos.y)*to_pos.y );
}


Mappather.lowestFscore = function(fScore, nodes) {
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


Mappather.getNeighbors = function(x, y, nodes) {
  var neighborCoords = Hx.getSurroundingHexes(x, y, 1);
  var neighbors = [];
  return _.filter(nodes, function(node) {
    return _.find(neighborCoords, function(coord) {
      return coord.x == node.x && coord.y == node.y;
    })
  })
}


Mappather.heuristic = function(current, neighbor) {
  if (neighbor.hasBuilding) {
    return 100;
  } else {
    return 1;
  }
}


Mappather.reconstructPath = function(cameFrom, current, nodes) {
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
    totalPath.push(node);
  })

  // remove start node
  totalPath.pop();

  return totalPath.reverse();
}
