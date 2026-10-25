Mapmaker = {

  mapClick: function(coordX, coordY) {
    check(coordX, Match.Integer);
    check(coordY, Match.Integer);

    var mouseMode = Session.get('mouse_mode');

    // spectators can only look
    if (dInit.isSpectating()) {
      mouseMode = 'default';
    }

    if (mouseMode == 'default') {

      dInit.select('hex', coordX, coordY, null);

    } else if (mouseMode == 'findingPath') {
      var selected = Session.get('selected');
      if (selected.type != 'army') {
        console.error('findingPath but army is not selected');
        return;
      }

      var alert = $('.moveArmyAlert');
      alert.hide();

      dFunc.callWithCallback('addArmyPath', [Session.get('gameId'), coordX, coordY, selected.id], function(error, result) {
        if (error) {
          alert.show();
          if (error.error == 'validation-error') {
            alert.html(error.details[0].type);
          } else {
            alert.html(error.reason);
          }
        }
      });

    } else if (mouseMode == 'modal') {

    }
  }
}
