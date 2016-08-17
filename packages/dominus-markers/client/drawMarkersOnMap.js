Template.drawMarkersOnMap.helpers({
  castleMarkers: function() {
    var find = {unitType: 'castle'};
    return Markers.find(find);
  },

  villageMarkers: function() {
    var find = {unitType: 'village'};
    return Markers.find(find);
  },

  hexMarkers: function() {
    var find = {unitType: 'hex'};
    return Markers.find(find);
  },

  armyMarkers: function() {
    var find = {unitType: 'army'};
    return Markers.find(find);
  },

  castleMarkerStart: function() {
    var offsetX = 41;
    var offsetY = -30;
    var data = Template.currentData();
    if (data) {
      var grid = Hx.coordinatesToPos(data.x, data.y, _s.init.hexSize, _s.init.hexSquish);
      return (grid.x+offsetX)+','+(grid.y+offsetY);
    }
  },

  castleMarkerTextPos: function() {
    var offsetX = 72;
    var offsetY = -57;
    var data = Template.currentData();
    if (data) {
      var pos = Hx.coordinatesToPos(data.x, data.y, _s.init.hexSize, _s.init.hexSquish);
      return {x:pos.x+offsetX, y:pos.y+offsetY};
    }
  },

  armyMarkerOffsetX: function() {
    return _s.armies.mapObjectOffsetX;
  },

  armyMarkerOffsetY: function() {
    return _s.armies.mapObjectOffsetY;
  },

  armyMarkerRadiusX: function() {
    return _s.armies.mapObjectHighlightRadius + 5;
  },

  armyMarkerRadiusY: function() {
    return (_s.armies.mapObjectHighlightRadius + 5) * _s.init.hexSquish;
  },

  armyMarkerStart: function() {
    var offsetX = 28;
    var offsetY = 20;
    var data = Template.currentData();
    if (data) {
      var grid = Hx.coordinatesToPos(data.x, data.y, _s.init.hexSize, _s.init.hexSquish);
      return (grid.x+offsetX)+','+(grid.y+offsetY);
    }
  },

  armyMarkerTextPos: function() {
    var offsetX = 57;
    var offsetY = -7;
    var data = Template.currentData();
    if (data) {
      var pos = Hx.coordinatesToPos(data.x, data.y, _s.init.hexSize, _s.init.hexSquish);
      return {x:pos.x+offsetX, y:pos.y+offsetY};
    }
  }
})
