Template.rp_info_army_paths.helpers({
  paths: function() {
    var find = {armyId: this._id};
    var options = {sort: {index:1}};
    return Armypaths.find(find, options);
  },

  hasPath: function(paths) {
    return paths.count() > 0;
  },

  army: function() {
    var army = Template.currentData();
    return army;
  },

  totalTravelTime: function() {
    Session.get('refresh_time_field_every_sec');
    var self = this;

    if (self.moveTime == null) {
      return '<i class="fa fa-refresh fa-spin"></i>';
    }

    var instance = Template.instance();
    if (instance) {
      if (instance.isPaused.get()) {
        return dInit.duration_shortDetailed(self.moveTime);
      } else {
        var arriveAt = moment(new Date(self.last_move_at)).add(self.moveTime, 'ms');
        return dInit.duration_shortDetailed(arriveAt - moment());
      }
    }
  },

  nextMoveTime: function() {
    Session.get('refresh_time_field_every_sec');
    var self = this;

    var instance = Template.instance();
    if (!instance) {
      return;
    }
    var isPaused = instance.isPaused.get();

    var arriveAt = moment(new Date(self.last_move_at)).add(self.speed, 'minutes');
    var ms = arriveAt - moment();

    if (isPaused) {
      if (ms > 0) {
        return dInit.duration_shortDetailed(ms) + ' after resumed';
      } else {
        return 'when resumed'
      }
    } else {
      if (ms > 0) {
        return 'in ' + dInit.duration_shortDetailed(ms);
      } else {
        return 'soon';
      }
    }
  },

  isPaused: function() {
    var instance = Template.instance();
    if (instance) {
      return instance.isPaused.get();
    }
  }
});

Template.rp_info_army_paths.onCreated(function() {
  var self = this;
  self.isPaused = new ReactiveVar(false);
  this.autorun(function() {
    var path = Armypaths.findOne({index:0});
    if (path) {
      self.isPaused.set(path.paused);
    }
  })
});

Template.rp_info_army_path.helpers({
  moveDistance: function() {
    if (this.distance == null) {
      return '<i class="fa fa-refresh fa-spin"></i>';
    } else {
      return this.distance + ' hexes';
    }
  },

  travelTime: function() {
    Session.get('refresh_time_field_every_sec');
    var self = this;

    var army = Template.parentData(1);

    if (!army) {
      return '<i class="fa fa-refresh fa-spin"></i>';
    }

    var path = Armypaths.findOne({index:0});
    if (!path) {
      return '<i class="fa fa-refresh fa-spin"></i>';
    }

    if (self.time === null) {
      return '<i class="fa fa-refresh fa-spin"></i>';
    }

    var isPaused = path.paused;

    if (isPaused) {
      //return self.time;
      return dInit.duration_shortDetailed(self.time);
    } else {
      if (self.index == 0) {
        var arriveAt = moment(new Date(army.last_move_at)).add(self.time, 'ms');
        return dInit.duration_shortDetailed(arriveAt - moment());
      } else {
        return dInit.duration_shortDetailed(self.time);
      }
    }
  }
});


Template.rp_info_army_paths.events({
  'click .removeArmyPathButton': function(event, template) {
    var path = this;
    Meteor.call('removeArmyPath', this._id);
  },

  'click .upArmyPathButton': function(event, template) {
    var path = this;
    Meteor.call('decreasePathIndex', path._id);
  },

  'click .downArmyPathButton': function(event, template) {
    var path = this;
    Meteor.call('increasePathIndex', path._id);
  },

  'click #pauseMovementButton': function(event, template) {
    event.preventDefault();
    var army = Template.currentData();
    Meteor.call('pauseMovement', army._id);
  },

  'click #resumeMovementButton': function(event, template) {
    event.preventDefault();
    var army = Template.currentData();
    Meteor.call('resumeMovement', army._id);
  },
});
