var dotSize = 7;
var offsetX = 12;
var offsetY = 30;
var textOffsetX = offsetX - dotSize - 5;
var textOffsetY = offsetY - dotSize - 5;


Template.armyPathHighlights.onRendered(function() {

  // highlight army path
  this.autorun(function() {
    clearArmyPathDots();

    var selected = Session.get('selected');
    if (selected && selected.type == 'army') {
      lastCoord = {x:selected.x, y:selected.y};
      var first = true;

      Armypaths.find({armyId:selected.id}, {sort:{index:1}}).forEach(function(path) {
        if (first) {
          drawArmyPathDot(lastCoord.x, lastCoord.y);
        }

        if (path.hexes && path.hexes.length) {
          path.hexes.forEach(hex => {
            drawArmyPathDot(hex.x, hex.y);
            drawArmyPathLine(lastCoord, {x:hex.x, y:hex.y});
            lastCoord = {x:hex.x, y:hex.y};
          });

          // hexes might not be entire paths
          var lastHex = path.hexes[path.hexes.length-1];
          if (lastHex) {
            if (lastHex.x != path.x || lastHex.y != path.y) {
              drawArmyPathDot(path.x, path.y);
              drawArmyPathLine(lastCoord, {x:path.x, y:path.y});
              lastCoord = {x:path.x, y:path.y};
            }
          }

        } else {
          drawArmyPathDot(path.x, path.y);
          drawArmyPathLine(lastCoord, {x:path.x, y:path.y});
          lastCoord = {x:path.x, y:path.y};
        }

        drawArmyPathDotCircle(path.x, path.y);
        drawArmyPathNumber(path.x, path.y, path.index);

        first = false;
      });

      if (Session.get('mouse_mode') == 'findingPath') {
        var mouseOverHexCoords = Session.get('mouseOverHexCoords');
        if (mouseOverHexCoords) {
          if (first) {
            drawArmyPathDot(lastCoord.x, lastCoord.y);
          }

          drawArmyPathDot(mouseOverHexCoords.x, mouseOverHexCoords.y);
          drawArmyPathLine(lastCoord, mouseOverHexCoords);
        }
      }
    }
  });
})


var clearArmyPathDots = function() {
  $('#armyHighlights-findingPath').empty();
}


var drawArmyPathNumber = function(x, y, num) {
  check(x, Match.Integer);
  check(y, Match.Integer);

  var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish);

  var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', grid.x + textOffsetX);
  text.setAttribute('y', grid.y + textOffsetY);
  text.setAttribute('class', 'armyPathText');
  text.textContent = num;
  $('#armyHighlights-findingPath').append(text);
}


var drawArmyPathLine = function(from, to) {
  check(from, {x:Match.Integer, y:Match.Integer});
  check(to, {x:Match.Integer, y:Match.Integer});

  var fromGrid = Hx.coordinatesToPos(from.x, from.y, _s.init.hexSize, _s.init.hexSquish);
  var toGrid = Hx.coordinatesToPos(to.x, to.y, _s.init.hexSize, _s.init.hexSquish);

  var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', fromGrid.x + offsetX);
  line.setAttribute('y1', fromGrid.y + offsetY);
  line.setAttribute('x2', toGrid.x + offsetX);
  line.setAttribute('y2', toGrid.y + offsetY);
  line.setAttribute('class', 'armyPathLine');
  $('#armyHighlights-findingPath').append(line);
}


var drawArmyPathDot = function(x, y) {
  check(x, Match.Integer);
  check(y, Match.Integer);

  var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish);

  var ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  ellipse.setAttribute('cx', grid.x + offsetX);
  ellipse.setAttribute('cy', grid.y + offsetY);
  ellipse.setAttribute('rx', dotSize);
  ellipse.setAttribute('ry', dotSize * _s.init.hexSquish);
  ellipse.setAttribute('class', 'armyPathDot');
  $('#armyHighlights-findingPath').append(ellipse);
}

var drawArmyPathDotCircle = function(x, y) {
  check(x, Match.Integer);
  check(y, Match.Integer);

  var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish);

  var ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  ellipse.setAttribute('cx', grid.x + offsetX);
  ellipse.setAttribute('cy', grid.y + offsetY);
  ellipse.setAttribute('rx', dotSize+4);
  ellipse.setAttribute('ry', (dotSize+4) * _s.init.hexSquish);
  ellipse.setAttribute('class', 'armyPathDotCircle');
  $('#armyHighlights-findingPath').append(ellipse);
}
