stubTestGame = function() {
  Games.remove({});
  let game = {
    _id: 'testgame',
    isSpeed: false,
    hasEnded: false,
    maxPlayers: 200
  }
  game._id = Games.insert(game);
  return game._id;
}


Tinytest.add('mappather.pathTo.multipleCountries', function(test) {
  let gameId = stubTestGame();

  Hexes.remove({});
  Countries.remove({});

  var numCountries = 8;
  var numTests = 2;
  _s.mapmaker.minHexesInCountry = 30;
  _s.mapmaker.maxHexesInCountry = 30;

  //Mapmaker.createNewMap(true);
  for (x=0;x<numCountries;x++) {
    Mapmaker.addCountry(gameId, true);
  }

  var numHexes = Hexes.find({gameId:gameId}).count();
  var hexes = Hexes.find({gameId:gameId}).fetch();

  for (n=0;n<numTests;n++) {
    var startNum = Math.floor(Math.random() * numHexes);
    var endNum = Math.floor(Math.random() * numHexes);

    // if they're the same find another number
    if (startNum == endNum) {
      endNum = Math.max(numHexes-startNum, Math.floor(startNum/2));
    }

    var startHex = hexes[startNum];
    var endHex = hexes[endNum];

    // ----- path to end, ignore countries

    var path = Mappather.pathTo(startHex.x, startHex.y, endHex.x, endHex.y, hexes, false);
    test.notEqual(path, false, 'to end, path not false');
    test.isTrue(path.length>0, 'to end, path length > 0');

    // check that path[0] is next to startHex
    test.equal(Hx.hexDistance(startHex.x, startHex.y, path[0].x, path[0].y), 1, 'to end, path[0] is next to startHex');

    // check that path[0] exists
    test.equal(Hexes.find({x:startHex.x, y:startHex.y}).count(), 1, 'to end, path[0] exists');

    // check that end of path is at endHex
    test.equal(path[path.length-1].x, endHex.x, 'to end, end of pat is at endHex');
    test.equal(path[path.length-1].y, endHex.y, 'to end, end of pat is at endHex');

    // ----- path to border

    var path = Mappather.pathTo(startHex.x, startHex.y, endHex.x, endHex.y, hexes, true);
    test.notEqual(path, false, 'to border, path not false');
    test.isTrue(path.length>0, 'to border, path length > 0');

    // check that path[0] is next to startHex
    test.equal(Hx.hexDistance(startHex.x, startHex.y, path[0].x, path[0].y), 1, 'to border, path[0] is next to startHex');

    // check that path[0] exists
    test.equal(Hexes.find({x:startHex.x, y:startHex.y}).count(), 1, 'to border, path[0] exists');

    // check that end is border
    var endX = path[path.length-1].x;
    var endY = path[path.length-1].y;
    test.isTrue(Hexes.findOne({x:endX, y:endY}).isBorder);

    // check that country is either same or neightbor
    var startCountry = Countries.findOne(startHex.countryId, {fields:{neighbors:1}});
    var endCountry = Countries.findOne({gameId:gameId, hexes: {$elemMatch: {x:endX, y:endY}}}, {fields:{_id:1}});

    var sameCountry = startCountry._id == endCountry._id;
    if (!sameCountry) {
      test.isTrue(_.contains(startCountry.neighbors, endCountry._id), 'to border, different country, end country is neighbor of start country');
    }
  }
});


Tinytest.add('mappather.pathTo.border', function(test) {
  var nodes = [{x:0, y:0, isBorder:false, hasBuilding:false, _id:'0_0'}];

  // same as Hx.getSurroundingHexes except keep track of which are border hexes
  // make a bunch of rings, rings 6 and 7 are borders
  var hexes = [];
  var borderHexes = [];
  var numRings = 9;
  var pos = {x:0, y:0}
  for (var k=1; k<=numRings; k++) {
    pos = Hx.getNeighbor(pos.x, pos.y, 4)
    for (var i =  0; i < 6; i++) {		// change direction
      for (var j = 0; j < k; j++) {		// number to get in this direction
        if (k == 6) {
          borderHexes.push({x:pos.x, y:pos.y});
        } else {
          hexes.push({x:pos.x, y:pos.y});
        }
        pos = Hx.getNeighbor(pos.x, pos.y, i)
      }
    }
  }

  hexes.forEach(function(h) {
    nodes.push({x:h.x, y:h.y, isBorder:false, hasBuilding:false, _id:h.x+'_'+h.y});
  })

  borderHexes.forEach(function(h) {
    nodes.push({x:h.x, y:h.y, isBorder:true, hasBuilding:false, _id:h.x+'_'+h.y});
  })

  var paths = Mappather.pathTo(0, 0, 0, 8, nodes, true);

  test.equal(paths.length, 6);

  for (var n=0; n<paths.length; n++) {
    if (n == 5) {
      test.equal(paths[n].isBorder, true);
    } else {
      test.equal(paths[n].isBorder, false);
    }
  }
});


Tinytest.add('mappather.pathTo.short', function(test) {
  var nodes = [{x:0, y:0, isBorder:false, hasBuilding:false, _id:'0_0'}];

  _.each(Hx.getSurroundingHexes(0,0,2), function(h) {
    nodes.push({x:h.x, y:h.y, isBorder:false, hasBuilding:false, _id:h.x+'_'+h.y});
  })

  var paths = Mappather.pathTo(0, 0, 0, 1, nodes, false);

  test.equal(paths.length, 1);
  test.equal(paths[0].x, 0);
  test.equal(paths[0].y, 1);
});


Tinytest.add('mappather.pathTo.long', function(test) {
  var nodes = [{x:0, y:0, isBorder:false, hasBuilding:false, _id:'0_0'}];

  _.each(Hx.getSurroundingHexes(0,0,10), function(h) {
    nodes.push({x:h.x, y:h.y, isBorder:false, hasBuilding:false, _id:h.x+'_'+h.y});
  })

  var paths = Mappather.pathTo(0, 0, 7, 0, nodes, false);

  test.equal(paths.length, 7);

  test.equal(paths[0].x, 1);
  test.equal(paths[0].y, 0);

  test.equal(paths[1].x, 2);
  test.equal(paths[1].y, 0);

  test.equal(paths[2].x, 3);
  test.equal(paths[2].y, 0);

  test.equal(paths[3].x, 4);
  test.equal(paths[3].y, 0);

  test.equal(paths[4].x, 5);
  test.equal(paths[4].y, 0);

  test.equal(paths[5].x, 6);
  test.equal(paths[5].y, 0);

  test.equal(paths[6].x, 7);
  test.equal(paths[6].y, 0);
})


Tinytest.add('mappather.getNeighbors', function(test) {
  var nodes = [{x:0, y:0, isBorder:false, hasBuilding:false, _id:'0_0'}];

  _.each(Hx.getSurroundingHexes(0,0,4), function(h) {
    nodes.push({x:h.x, y:h.y, isBorder:false, hasBuilding:false, _id:h.x+'_'+h.y});
  })

  var neighbors = Mappather.getNeighbors(0, 0, nodes);
  var correctNeighbors = Hx.getSurroundingHexes(0,0,1);

  test.equal(correctNeighbors.length, 6);
  test.equal(neighbors.length, 6);

  _.each(correctNeighbors, function(cn) {
    var result = _.find(neighbors, function(n) {
      return cn.x == n.x && cn.y == n.y;
    })

    test.isNotUndefined(result);
  })
})


Tinytest.add('mappather.getStartNode', function(test) {
  var nodes = [{x:0, y:0, isBorder:false, hasBuilding:false, _id:'0_0'}];

  _.each(Hx.getSurroundingHexes(0,0,4), function(h) {
    nodes.push({x:h.x, y:h.y, isBorder:false, hasBuilding:false, _id:h.x+'_'+h.y});
  })

  var startNode = Mappather.getStartNode(2, 2, nodes);

  test.equal(startNode.x, 2);
  test.equal(startNode.y, 2);
  test.equal(startNode.hasBuilding, false);
})


Tinytest.add('mappather.lowestFscore', function(test) {

  var fScore = {};

  var nodes = [
    {_id:'0_0', x:0, y:0, isBorder:false, hasBuilding:false, _id:'0_0'},
    {_id:'1_0', x:1, y:0, isBorder:false, hasBuilding:false, _id:'1_0'},
    {_id:'2_0', x:2, y:0, isBorder:false, hasBuilding:false, _id:'2_0'},
    {_id:'3_0', x:3, y:0, isBorder:false, hasBuilding:false, _id:'3_0'},
    {_id:'4_0', x:4, y:0, isBorder:false, hasBuilding:false, _id:'4_0'}
  ];

  fScore['0_0'] = 6;
  fScore['1_0'] = -8;
  fScore['2_0'] = -2;
  fScore['3_0'] = 0;
  fScore['4_0'] = 4;

  var lowest = Mappather.lowestFscore(fScore, nodes);
  test.equal(lowest._id, '1_0');
})
