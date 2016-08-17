// create a path going around the border of a country
// complicated because country could have holes

// loop through all sides of all hexes
// find if they are a border side
// set check flag for all sides to false

// find a side
// walk along open sides creating path and set checked flag
// check rest of sides, if one is unchecked start another path



if (process.env.DOMINUS_WORKER == 'true') {
  Queues.createCountryMask.process(Meteor.bindEnvironment(function(job) {
    var countryId = job.data.countryId;

    var find = {_id:countryId};
    var options = {fields:{hexes:1, gameId:1}};
    var country = Countries.findOne(find, options);

    if (country) {
      var countrymasker = new Countrymasker(country.hexes);
      country.paths = countrymasker.startMasker();
      Countries.update(country._id, {$set:{paths:country.paths}});

      Queues.add('generateGameMinimap', {gameId:country.gameId}, {backoff:{type:'fixed', delay:30000}, attempts:10, delay:0, timeout:1000*60*5}, country.gameId);
    } else {
      console.error('no country found in createMinimapBg addJob');
    }

    return Promise.resolve();
  }));
}




Countrymasker = function(hexes) {
  this.hexes = hexes;
  this.paths = [];
  this.hex = null;
  this.side = null;
}


Countrymasker.prototype.startMasker = function() {
  this.setDefaults();
  this.findBorders();
  this.findPaths();

  // sort paths by length of path so that outer path is first
  this.paths = _.sortBy(this.paths, function(path) {
    return path.length * -1;
  })

  // reverse order of paths except first
  // var n = 0;
  // this.paths = _.map(this.paths, function(path) {
  //   n++;
  //   if (n == 1) {
  //     return path;
  //   } else {
  //     return path.reverse();
  //   }
  // })

  return this.paths;
}


Countrymasker.prototype.findPaths = function() {
  var self = this;

  while (true) {

    var path = [];
    var hex = this.findHexToStartPath(self.hexes);

    // if no hex found then no more paths
    if (!hex) {
      break;
    }

    var side = this.findSideToStartPath(hex);

    if (!side) {
      console.error('start side not found');
      break;
    }

    while (true) {
      if (!side) {
        console.error('no side');
        break;
      }

      var sidePos = this.getPosOfSide(hex.x, hex.y, side.direction, _s.mapmaker.hexSize, _s.mapmaker.hexSquish);
      path.push(sidePos);
      side.checked = true;

      var nextDirection = this.getNextDirection(side.direction);

      if (hex.sides[nextDirection].isBorder) {
        side = hex.sides[nextDirection];
      } else {
        var nextHexCoord = Hx.getNeighbor(hex.x, hex.y, nextDirection);
        var nextHex = self.getHexByCoord(nextHexCoord.x, nextHexCoord.y, self.hexes);
        var nextSideDirection = side.direction + 1;
        if (nextSideDirection > 5) {
          nextSideDirection = 0;
        }
        hex = nextHex;
        side = nextHex.sides[nextSideDirection];
      }

      if (side.checked) {
        // path done
        break;
      }
    }

    this.paths.push(path);
  }
}



Countrymasker.prototype.getNextDirection = function(direction) {
  var nextDir = direction - 1;
  if (nextDir < 0) {
    nextDir = 5;
  }
  return nextDir;
}




Countrymasker.prototype.getHexByCoord = function(x,y, hexes) {
  var self = this;

  return _.find(hexes, function(hex) {
    return hex.x == x && hex.y == y;
  })
}


Countrymasker.prototype.findBorders = function() {
  var self = this;

  _.each(self.hexes, function(hex) {
    for (var d=0; d<6; d++) {
      var neighborCoord = hex.sides[d].neighborCoord;

      var neighbor = _.find(self.hexes, function(h) {
        return h.x == neighborCoord.x && h.y == neighborCoord.y;
      })

      if (neighbor) {
        hex.sides[d].isBorder = false;
      }
    }
  })
}


Countrymasker.prototype.setDefaults = function() {
  var self = this;

  _.each(self.hexes, function(hex) {
    hex.sides = [];
    var hexPos = Hx.coordinatesToPos(hex.x, hex.y, _s.mapmaker.hexSize, _s.mapmaker.hexSquish);
    for (var d=0; d<6; d++) {

      var side = {
        checked: false,
        isBorder: true,
        neighborCoord: Hx.getNeighbor(hex.x, hex.y, d),
        direction: d,
        hexPos: hexPos
      };

      hex.sides.push(side);
    }
  })
}





// 0 = 0
// 1 = 60
// 2 = 120
// 3 = 180
// 4 = 240
// 5 = 300

Countrymasker.prototype.getPosOfSide = function(hexX, hexY, direction, hexSize, hexSquish) {
  var angle = 2 * Math.PI / 6 * direction * -1;

  var hexPos = Hx.coordinatesToPos(hexX, hexY, hexSize, hexSquish);

  var pointX = (hexSize * Math.cos(angle)) + hexPos.x;
  var pointY = (hexSize * Math.sin(angle) * hexSquish) + hexPos.y;

  check(pointX, Number);
  check(pointY, Number);

  pointX = Math.round(pointX * 100) / 100;
  pointY = Math.round(pointY * 100) / 100;

  return {x:pointX, y:pointY};
}


Countrymasker.prototype.findSideToStartPath = function(hex) {
  return _.find(hex.sides, function(side) {
    return !side.checked && side.isBorder;
  })
}



Countrymasker.prototype.findHexToStartPath = function(hexes) {
  return _.find(hexes, function(hex) {
    return _.find(hex.sides, function(side) {
      return !side.checked && side.isBorder;
    })
  })
}
