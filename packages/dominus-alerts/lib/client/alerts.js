alertSharedEvents = {
  'click .openAlertButton': function(event, template) {
    event.preventDefault();
    
    if (Template.instance().isOpen.get()) {
      Template.instance().isOpen.set(false)
    } else {
      Template.instance().isOpen.set(true)
      Meteor.call('markAlertAsRead', template.data.gameId, template.data._id)
    }
  },

  'click .userLink': function(event, template) {
    event.preventDefault();
    var x = parseInt(event.currentTarget.getAttribute('data-x'))
    var y = parseInt(event.currentTarget.getAttribute('data-y'))
    var castle_id = event.currentTarget.getAttribute('data-castle_id')

    dInit.select('castle', x, y, castle_id);
    dHexmap.centerOnHex(x,y);
  },

  'click .armyLink': function(event, template) {
    event.preventDefault();
    event.stopPropagation()
    var x = parseInt(event.currentTarget.getAttribute('data-x'))
    var y = parseInt(event.currentTarget.getAttribute('data-y'))
    var army_id = event.currentTarget.getAttribute('data-army_id');
    dInit.select('army', x, y, army_id);
    dHexmap.centerOnHex(x,y);
  },

  'click .capitalLink': function(event, template) {
    event.preventDefault();
    event.stopPropagation()
    var x = parseInt(event.currentTarget.getAttribute('data-x'))
    var y = parseInt(event.currentTarget.getAttribute('data-y'))
    var capital_id = event.currentTarget.getAttribute('data-capital_id');
    dInit.select('capital', x, y, capital_id);
    dHexmap.centerOnHex(x,y);
  },

  'click .coordinateLink': function(event, template) {
    event.preventDefault()
    event.stopPropagation()
    var hex = {
      x: parseInt(event.currentTarget.getAttribute('data-x')),
      y: parseInt(event.currentTarget.getAttribute('data-y'))
    }
    check(hex.x, validNumber);
    check(hex.y, validNumber);

    dInit.select('hex', hex.x, hex.y, null);
    dHexmap.centerOnHex(hex.x, hex.y);
  }
}


alertSharedHelpers = {
  isOpen: function() {
    return Template.instance().isOpen.get()
  },

  read: function() {
    let playerId = Session.get('playerId');
    if (playerId) {
      var record = _.find(this.playerIds, function(player) {
        return player.playerId == playerId;
      })
      return record.read
    }
  }
}


globalAlertSharedEvents = {
  'click .openAlertButton': function(event, template) {
    event.preventDefault();
    if (Template.instance().isOpen.get()) {
      Template.instance().isOpen.set(false)
    } else {
      Template.instance().isOpen.set(true)
    }
  },

  'click .userLink': function(event, template) {
    event.preventDefault();
    var x = parseInt(event.currentTarget.getAttribute('data-x'))
    var y = parseInt(event.currentTarget.getAttribute('data-y'))
    var castle_id = event.currentTarget.getAttribute('data-castle_id');
    dInit.select('castle', x, y, castle_id);
    dHexmap.centerOnHex(x,y);
  },
}


globalAlertSharedHelpers = {
  isOpen: function() {
    return Template.instance().isOpen.get()
  }
}


alertSharedRendered = function() {
  this.find('.alertAnimationWrapper')._uihooks = {
    insertElement: function(node, next) {
      $(node).hide().insertBefore(next).slideDown(120)
    },
    removeElement: function(node) {
      $(node).slideUp(80, function() {
        $(this).remove()
      })
    }
  }
}
