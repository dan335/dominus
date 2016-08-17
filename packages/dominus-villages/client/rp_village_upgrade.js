Template.rp_village_upgrade.helpers({
    upgradeTime: function() {
        var village = Template.instance().villageData.get()
        if (village && village.level) {
          let ms = _gs.villages(Session.get('gameId'), 'cost.level'+(village.level+1)+'.timeToBuild');
          //var ms = _s.villages.cost['level'+(village.level+1)].timeToBuild
          var duration = moment.duration(ms)
          return duration.humanize()
        }
    },

    upgradeText: function() {
        var village = Template.instance().villageData.get()
        if (village && village.level) {
            switch (village.level) {
                case 1:
                    var text = 'Upgrading to level 2 enables the hiring of footmen and pikemen.'
                    break;
                case 2:
                    var text = 'Upgrading to level 3 enables the hiring of cavalry and catapults.'
                    break;
            }

            return text
        }
    },

    // get number of each type the village costs
    cost: function(type) {
        var village = Template.instance().villageData.get()
        if (village && village.level) {
            return _s.villages.cost['level'+(village.level+1)][type]
        }
    },

    // only show row in table if the cost for this resource type is greater than zero
    // hide if resource is not required to upgrade village
    costGreaterThanZero: function(type) {
        var village = Template.instance().villageData.get()
        if (village && village.level) {
            if (_s.villages.cost['level'+(village.level+1)][type] > 0) {
                return true
            }
        }
    },

    // does user have enough of this type to upgrade village
    hasEnoughType: function(type) {
        var userFields = {}
        _s.market.types.forEach(function(type) {
            userFields[type] = 1
        });

        let playerId = Session.get('playerId');
        if (playerId) {
          let player = Players.findOne(playerId, {fields:userFields});
          if (player) {
            let village = Template.instance().villageData.get();
            if (village && village.level) {
              if (player[type] >= _s.villages.cost['level'+(village.level+1)][type]) {
                return '';
              }
            }
          }
        }

        return 'danger';
    },

    hasEnough: function() {
        var hasEnough = true

        var userFields = {}
        _s.market.types.forEach(function(type) {
            userFields[type] = 1
        })

        let playerId = Session.get('playerId');
        if (playerId) {
          let player = Players.findOne(playerId, {fields:userFields});
          if (player) {
            var village = Template.instance().villageData.get()
            if (village && village.level) {
                _s.market.types.forEach(function(type) {
                    if (player[type] < _s.villages.cost['level'+(village.level+1)][type]) {
                        hasEnough = false
                    }
                })

                if (!hasEnough) {
                    return 'disabled'
                }
            }
          }
        }
    }
})


Template.rp_village_upgrade.events({
    'click #cancelButton': function(event, template) {
      event.preventDefault();
      Session.set('rp_template', 'rp_info_village')
    },

    'click #upgradeVillageButton': function(event, template) {
      event.preventDefault();
      var alert = template.find('#upgradeVillageAlert')
      var button = template.find('#upgradeVillageButton')
      var buttonText = $(button).html()

      $(alert).hide()
      $(button).html('Upgrading Village...')

      Meteor.apply('upgradeVillage', [Session.get('gameId'), template.data._id], {}, function(error, result) {
          $(button).html(buttonText)
          if (error) {
              $(alert).html(error.error)
              $(alert).show(100)
          } else {
              Session.set('rp_template', 'rp_info_village')
          }
      })
    },
})


Template.rp_village_upgrade.created = function() {
    var self = this
    self.villageData = new ReactiveVar(null)
    self.autorun(function() {
      var selected = Session.get('selected');
      if (selected) {
        var village = RightPanelVillages.findOne(selected.id)
        if (village) {
          self.villageData.set(village)
        } else {
          self.villageData.set(null)
        }
      }
    })
}
