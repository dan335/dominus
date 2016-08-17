var dotSize = 4;

Template.armyPastMoves.onRendered(function() {
  var offsetPath = {x:12, y:30};
  Session.get('refresh_time_field');

  this.autorun(function() {
    var currentData = Template.currentData();

    if (currentData) {
      removePath(currentData._id);

      var pastMoves = currentData.pastMoves;
      if (pastMoves && pastMoves.length) {

        var d = "";
        var first = true;
        var num = _s.armies.pastMovesToShow-1;
        var lastPos = {};

        // reverse so that last move is drawn first
        // so that lines fade out
        pastMoves.reverse();

        pastMoves.forEach(function(move) {

          var cutoff = moment(new Date()).subtract(_s.armies.pastMovesMsLimit, 'ms');
          if (moment(new Date(move.moveDate)).isAfter(cutoff)) {

            var pos = Hx.coordinatesToPos(move.x, move.y, _s.init.hexSize, _s.init.hexSquish);
            pos.x += offsetPath.x;
            pos.y += offsetPath.y;

            if (!first) {
              var d = 'M '+lastPos.x+' '+lastPos.y;
              d += ' L '+pos.x+' '+pos.y;

              var path = document.createElementNS('http://www.w3.org/2000/svg',"path");
      				path.setAttributeNS(null, "d", d);
      				path.setAttribute('class', 'armyPastMoveLine age'+num);
      				path.setAttribute('data-id', currentData._id);
      				$('#armyPastMoves').append(path);

              num--;
            }

            lastPos = pos;
            first = false;
					}

        });
      }
    }
  })
})


Template.armyPastMoves.onDestroyed(function() {
  var currentData = Template.currentData();
  if (currentData) {
    removePath(currentData._id);
  }
});


var removePath = function(armyId) {
  $('.armyPastMoveLine[data-id='+armyId+']').remove();
  $('.armyPastMovePoint[data-id='+armyId+']').remove();
}
