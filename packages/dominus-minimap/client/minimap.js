Template.minimap.helpers({
  isOutside: function(index) {
    if (!index) {
      return 'outsideClipPath';
    } else {
      return 'insideClipPath';
    }
  },

  countrySvg: function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      let game = Games.findOne(gameId, {fields: {minimap:1}});
      if (game && game.minimap) {
        return game.minimap;
      }
    }
  },

  backgroundUrl: function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      let game = Games.findOne(gameId, {fields: {minimapUpdatedAt:1}});
      if (game) {
        return Meteor.settings.public.s3.url + 'minimapbg/minimapbg_' + gameId + '.svg?' + new Date(game.minimapUpdatedAt).getTime();
      }
    }
  },

  backgroundClipUrl: function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      let game = Games.findOne(gameId, {fields: {minimapUpdatedAt:1}});
      if (game) {
        return Meteor.settings.public.s3.url + 'minimapbg/' + gameId + '/minimapbgclip.jpg?' + new Date(game.minimapUpdatedAt).getTime();
      }
    }
  },

  minimap_coord_to_pixel_x: function(x, y, passedOffset) {
    var miniHexSize = Template.instance().minimapHexSize.get();
    var offset = Template.instance().offset.get();
    var coords = Hx.coordinatesToPos(x, y, miniHexSize, _s.init.hexSquish);
    coords.x += _s.minimap.minimapContainerSize/2;
    return coords.x + offset.x + passedOffset;
  },

  minimap_coord_to_pixel_y: function(x, y, passedOffset) {
    var miniHexSize = Template.instance().minimapHexSize.get();
    var offset = Template.instance().offset.get();
    var coords = Hx.coordinatesToPos(x, y, miniHexSize, _s.init.hexSquish);
    coords.y += _s.minimap.minimapContainerSize/2;
    return coords.y + offset.y + passedOffset;
  },

  bgPathPoints: function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      let game = Games.findOne(gameId, {fields: {minimapBgPath:1}});
      if (game && game.minimapBgPath) {
        var hexSize = Template.instance().minimapHexSize.get();
        var offset = Template.instance().offset.get();
        var points = '';
        game.minimapBgPath.forEach(function(point) {

          var coords = Hx.coordinatesToPos(point.x, point.y, hexSize, _s.init.hexSquish);
          coords.x += _s.minimap.minimapContainerSize/2;
          coords.y += _s.minimap.minimapContainerSize/2;

          points += ' '+(coords.x + offset.x)+','+(coords.y + offset.y);
        })
        return points;
      }
    }
  },

  capitalRelationship: function() {
    let playerId = Session.get('playerId');
    if (playerId) {
      if (this.playerId == playerId) {
        return 'mine';
      } else {
        return 'enemy';
      }
    } else {
      return 'enemy';
    }
  },

  markers: function() {
    return Markers.find();
  },

  castles: function() {
    return LeftPanelCastle.find()
  },

  villages: function() {
    return LeftPanelVillages.find()
  },

  armies: function() {
    return MyArmies.find({}, {fields: {x:1, y:1}})
  },

  lords: function() {
    return LeftPanelLords.find()
  },

  countries: function() {
    return LeftPanelCapitals.find()
  },

  allies: function() {
    return LeftPanelAllies.find()
  },

  viewport_size: function() {
    return Template.instance().viewportSize.get();
  },

  viewport_position: function() {
    var centerHex = Session.get('center_hex')
    if (centerHex) {
      var viewportSize = Template.instance().viewportSize.get();
      var hexSize = Template.instance().minimapHexSize.get();

      var coords = Hx.coordinatesToPos(centerHex.x, centerHex.y, hexSize, _s.init.hexSquish);
      coords.x += _s.minimap.minimapContainerSize/2;
      coords.y += _s.minimap.minimapContainerSize/2;

      var offset = Template.instance().offset.get();
      coords.x = coords.x - viewportSize.width/2 + offset.x;
      coords.y = coords.y - viewportSize.height/2 + offset.y;
      return coords;
    }
  },

  containerSize: function() {
    return _s.minimap.minimapContainerSize;
  }
});



Template.minimap.events({
  'click .minimapPath': function(event, template) {
    event.preventDefault();

    var hexSize = Template.instance().minimapHexSize.get();
    var offset = Template.instance().offset.get();

    // wrong in both chrome in firefox
    // but it's the same in both
    // var target = event.target || event.srcElement;
    // var rect = target.getBoundingClientRect();
    // var x = event.clientX - rect.left;
    // var y = event.clientY - rect.top;

    // works in chrome but not firefox
    var x = event.offsetX || event.originalEvent.layerX;
    var y = event.offsetY || event.originalEvent.layerY;

    if (!isNaN(x) && !isNaN(y) && hexSize) {
      x -= _s.minimap.minimapContainerSize/2 + offset.x;
      y -= _s.minimap.minimapContainerSize/2 + offset.y;

      var coords = Hx.posToCoordinates(x, y, hexSize, _s.init.hexSquish);

      dHexmap.centerOnHex(coords.x,coords.y);
    }
  }
});



Template.minimap.onRendered(function() {
  // draw army paths
  this.autorun(function() {
    $('#minimap_armyPaths').empty();

    Armypaths.find({index:0}).forEach(function(path) {
      var army = MyArmies.findOne(path.armyId);
      if (!army) {
        return;
      }

      var lastCoord = {x:army.x, y:army.y};
      Armypaths.find({armyId:army._id}, {sort:{index:1}}).forEach(function(p) {

        var hexSize = Template.instance().minimapHexSize.get();
        var offset = Template.instance().offset.get();

        var from = Hx.coordinatesToPos(lastCoord.x, lastCoord.y, hexSize, _s.init.hexSquish);
        from.x += _s.minimap.minimapContainerSize/2;
        from.y += _s.minimap.minimapContainerSize/2;
        from.x += offset.x;
        from.y += offset.y;

        var to = Hx.coordinatesToPos(p.x, p.y, hexSize, _s.init.hexSquish);
        to.x += _s.minimap.minimapContainerSize/2;
        to.y += _s.minimap.minimapContainerSize/2;
        to.x += offset.x;
        to.y += offset.y;

        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', from.x);
        line.setAttribute('y1', from.y);
        line.setAttribute('x2', to.x);
        line.setAttribute('y2', to.y);
        line.setAttribute('class', 'minimapArmyPathLine');
        $('#minimap_armyPaths').append(line);

        lastCoord = {x:p.x, y:p.y};
      })
    })
  })
})





Template.minimap.onCreated(function() {
  var self = this

  this.minimapHexSize = new ReactiveVar(null);
  this.offset = new ReactiveVar({x:0, y:0});
  this.viewportSize = new ReactiveVar({width:0, height:0});

  // size of hexes in minimap
  // radius
  this.autorun(function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      let game = Games.findOne(gameId, {fields: {map_size:1}});
      if (game && game.map_size) {
        let ratio = Minimap.minimapSizeRatio(game.map_size)
        self.minimapHexSize.set(_s.init.hexSize * ratio);
      }
    }
  })

  // viewport size
  this.autorun(function() {
    var canvas_size = Session.get('canvas_size');
    var hexScale = Session.get('hexScale');
    var minimapHexSize = self.minimapHexSize.get();

    if (!hexScale) {
      hexScale = 1;
    }

    if (canvas_size && hexScale && minimapHexSize) {
      var hexSizeScaled = _s.init.hexSize * hexScale;
      var distanceBetween = Hx.distanceBetweenHexes(hexSizeScaled, _s.init.hexSquish);
      var miniDistanceBetween = Hx.distanceBetweenHexes(minimapHexSize, _s.init.hexSquish);

      var mini_canvas_width = (canvas_size.width / distanceBetween.horiz) * miniDistanceBetween.horiz;
      var mini_canvas_height = (canvas_size.height / distanceBetween.vert) * miniDistanceBetween.horiz;

      self.viewportSize.set({width:mini_canvas_width, height:mini_canvas_height});
    }
  });

  // offset to center minimap in container
  this.autorun(function() {
    let gameId = Session.get('gameId');
    var minimapHexSize = self.minimapHexSize.get();
    if (gameId) {
      let game = Games.findOne(gameId, {fields: {map_size:1}});
      if (game && game.map_size && minimapHexSize) {
        let offset = Minimap.minimapOffset(game.map_size, minimapHexSize)
        self.offset.set(offset);
      }
    }
  });
})


var pixel_to_coordinates = function(pixel_x, pixel_y, minimapHexSize) {
  check(pixel_x, Number);
  check(pixel_y, Number);
  check(minimapHexSize, Number);

  var x = pixel_x - _s.minimap.minimapContainerSize/2
  var y = pixel_y - _s.minimap.minimapContainerSize/2

  var q = 2/3 * x / minimapHexSize;
  var r = (1/3 * (Math.sqrt(3) / _s.init.hexSquish) * y - 1/3 * x) / minimapHexSize;

  // just rounding doesn't work, must convert to cube coords then round then covert to axial
  var cube = Hx.convertAxialToCubeCoordinates(q,r)
  var round = Hx.roundCubeCoordinates(cube.x, cube.y, cube.z)
  var axial = Hx.convertCubeToAxialCoordinates(round.x, round.y, round.z)

  return {
    x:axial.x,
    y:axial.y
  }
}
