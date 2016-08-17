Template.alerts_panel.helpers({
    mineActive: function() {
        if (Template.instance().activeTab.get() == 'mine') {
            return 'active'
        }
    },

    globalActive: function() {
        if (Template.instance().activeTab.get() == 'global') {
            return 'active'
        }
    },

    battlesActive: function() {
        if (Template.instance().activeTab.get() == 'battles') {
            return 'active'
        }
    },

    numUnreadAlerts: function() {
        return UnreadAlerts.find().count()
    },

    timeUntilGameEnd: function() {
        Session.get('refresh_time_field')
        return moment.duration(moment(new Date(s.game_end)) - moment()).humanize()
    },

    // isGameEndDateSet: function() {
    //   let gameId = Session.get('gameId');
    //   if (gameId) {
    //     let game = Games.findOne(gameId, {fields: {endDate:1}});
    //     if (game && game.endDate) {
    //       return true;
    //     }
    //   }
    // },
    //
    // isGameOver: function() {
    //   let gameId = Session.get('gameId');
    //   if (gameId) {
    //     let game = Games.findOne(gameId, {fields: {hasEnded:1}});
    //     if (game && game.hasEnded) {
    //       return true;
    //     }
    //   }
    // },

    // timeTilGameEndWhenNewDominus: function() {
    //     return moment.duration(_s.init.time_til_game_end_when_new_dominus).humanize()
    // },
    //
    // gameEndDate: function() {
    //   let gameId = Session.get('gameId');
    //   if (gameId) {
    //     let game = Games.findOne(gameId, {fields: {endDate:1}});
    //     if (game && game.endDate) {
    //       return game.endDate
    //     }
    //   }
    // },
    //
    // dominus: function() {
    //     return DominusPlayer.findOne()
    // },
    //
    // previousDominus: function() {
    //     return DominusPlayer.findOne()
    // }
})


Template.alerts_panel.events({
    'click #mineButton': function(event, template) {
        event.preventDefault()
        Template.instance().activeTab.set('mine')
    },

    'click #globalButton': function(event, template) {
        event.preventDefault()
        Template.instance().activeTab.set('global')
    },

    'click #battlesButton': function(event, template) {
        event.preventDefault();
        Template.instance().activeTab.set('battles')
    },

    'click .userLink': function(event, template) {
      event.preventDefault();
      var x = parseInt(event.currentTarget.getAttribute('data-x'))
      var y = parseInt(event.currentTarget.getAttribute('data-y'))
      var castle_id = event.currentTarget.getAttribute('data-castle_id')

      dInit.select('castle', x, y, castle_id);
      dHexmap.centerOnHex(x,y);
    },
})


Template.alerts_panel.created = function() {
  var self = this

  self.activeTab = new ReactiveVar('mine')

  // this.autorun(function() {
  //   let gameId = Session.get('gameId');
  //   if (gameId) {
  //     let game = Games.findOne(gameId, {fields: {lastDominusPlayerId:1}});
  //     if (game && game.lastDominusPlayerId) {
  //       Meteor.subscribe('alertPreviousDominus', game.lastDominusPlayerId)
  //     }
  //   }
  // });

  // this.autorun(function() {
  //   let gameId = Session.get('gameId');
  //   if (gameId) {
  //     Meteor.subscribe('dominus_rankings', gameId);
  //   }
  // })
}


Template.alerts_panel.rendered = function() {
    this.firstNode.parentNode._uihooks = leftPanelAnimation
}
