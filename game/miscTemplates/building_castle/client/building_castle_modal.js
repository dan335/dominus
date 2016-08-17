Template.building_castle_modal.helpers({
    show: function() {
      var fields = {castle_id:1, x:1, y:1}
      var player = Players.findOne({gameId:Session.get('gameId'), userId:Meteor.userId()}, {fields: fields})
      if (player) {
          if(typeof player.castle_id == 'undefined' || typeof player.x == 'undefined' || typeof player.y == 'undefined') {
              return true;
          } else {
              return false;
          }
      }
    }
})
