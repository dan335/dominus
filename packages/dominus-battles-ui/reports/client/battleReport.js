Template.battleReport.helpers({
  next_fight_in: function() {
    Session.get('refresh_time_field')
    let gameId = Session.get('gameId');
    let interval = _gs.battles(gameId, 'battleInterval');
    var time = moment(new Date(this.updatedAt)).add(interval, 'ms')
    if (time.isAfter(moment(new Date()))) {
      return moment(new Date(this.updatedAt)).add(interval, 'ms').fromNow();
    } else {
      return null;
    }
  },

  numLost: function() {
    var parentData = Template.parentData(1);
    if (parentData) {
      return parentData[this];
    }
  },

  roundTitles: function() {
    return Roundtitles.find({battle_id:this._id}, {sort:{roundNumber:-1}})
  },

  losesOpen: function() {
    return Template.instance().losesOpen.get();
  },

  gameId: function() {
    return Session.get('gameId');
  }
})


Template.battleReport.events({
  'click .shareButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/game/'+Session.get('gameId')+'/battle/'+this._id);
  },

  'click .losesOpenButton': function(event, template) {
    event.preventDefault();
    var open = Template.instance().losesOpen.get();
    if (open) {
      Template.instance().losesOpen.set(false);
    } else {
      Template.instance().losesOpen.set(true);
    }
  },

  'click .battleReportGotoHex': function(event, template) {
    event.preventDefault();
    var self = this;
    if (Number.isInteger(self.x) && Number.isInteger(self.y)) {
      dInit.select('hex', self.x, self.y, null);
      dHexmap.centerOnHex(self.x, self.y);
    }
  }
})


Template.battleReport.onCreated(function() {
  var self = this;

  self.losesOpen = new ReactiveVar(false);

  self.autorun(function() {
    var currentData = Template.currentData();
    if (currentData) {
      self.subscribe('roundtitles', currentData._id);
    }
  })

  //this.subscribe('lastFightInBattle', Template.currentData()._id);
})
