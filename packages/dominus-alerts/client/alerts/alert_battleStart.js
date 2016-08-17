var helpers = {
    battle: function() {
        if (this) {
            return Battles2.findOne(this.vars.battle_id)
        }
    },

    title: function() {
        if (this) {
            switch(this.vars.type) {
              case 'capital':
                return 'Your capital is under attack.'
                break;
              case 'castle':
                  return 'Your castle is under attack.'
                  break;
              case 'village':
                  return 'Your village is under attack.'
                  break;
              case 'army':
                  return 'Your army is in a battle.'
                  break;
            }
        }
    },

    iconName: function() {
        if (this) {
            switch(this.vars.type) {
              case 'capital':
                return 'fa-shield';
                break;
              case 'castle':
                  return 'fa-shield'
                  break;
              case 'village':
                  return 'fa-shield'
                  break;
              case 'army':
                  return 'fa-gavel'
                  break;
            }
        }
    }
}

Template.alert_battleStart.helpers(_.extend(alertSharedHelpers, helpers))
Template.alert_battleStart.events = alertSharedEvents
Template.alert_battleStart.rendered = alertSharedRendered

Template.alert_battleStart.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)

    self.autorun(function() {
        if (Template.currentData()) {
            if (self.isOpen.get()) {
                Meteor.subscribe('battle', Template.currentData().vars.battle_id)
            }
        }
    })
}
