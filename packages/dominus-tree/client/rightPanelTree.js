var lords = new ReactiveVar([])

Template.rightPanelTree.onCreated(function() {
  this.autorun(function() {
    let data = Template.currentData();
    if (data) {
      let player = RightPanelPlayers.findOne(data.playerId);
      if (player) {
        var lordsArray = getLords(player, []).reverse()
        lordsArray.push(player)
        lords.set(lordsArray)
      }
    }
  })
})


Template.rightPanelTree.helpers({
    king: function() {
      return lords.get()[0]
    },

    hasLords: function() {
      var player = RightPanelPlayers.findOne(this.playerId)
      if (player) {
        return player.lord
      }
    },

    thisUser: function() {
      var player = RightPanelPlayers.findOne(this.playerId)
      if (player) {
        return player
      }
    },
})

var getLords = function(user, lordsArray) {
  var lord = RightPanelTreePlayers.findOne(user.lord)
  if (lord) {
    lordsArray.push(lord)
    if (lord.lord) {
      lordsArray = getLords(lord, lordsArray)
    }
  }
  return lordsArray
}


Template.rightPanelTreeUser.helpers({
    getNextLord: function() {
      var self = this
      var nextLord = _.find(lords.get(), function(lord) {
          return lord.lord == self._id
      })
      return nextLord
    }
})

Template.rightPanelTreeUser.events({
    'click .username': function(event, template) {
      event.preventDefault();
      dInit.select('castle', this.x, this.y, this.castle_id);
      dHexmap.centerOnHex(this.x, this.y);
    }
})
