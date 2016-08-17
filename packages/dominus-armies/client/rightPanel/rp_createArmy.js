Template.rp_createArmy.helpers({
  _sArmies: function() {
    return _s.armies;
  },

  selectedArmy: function() {
    var instance = Template.instance();
    if (instance) {
      return instance.selectedArmy.get()[this.toString()];
    }
  },

  maxArmy: function() {
    var data = Template.parentData(1);
    if (data) {
      return data[this.toString()];
    }
  }
});


Template.rp_createArmy.events({
  'click #createArmyCancelButton': function(event, template) {
    var selected = Session.get('selected');
    Session.set('rp_template', 'rp_info_'+selected.type);
  },

  'input .setNumSoldierSlider, change .setNumSoldierSlider': function(event, template) {
    var type = event.currentTarget.getAttribute('data-type');
    var num = parseInt(event.currentTarget.value);

    var selected = Template.instance().selectedArmy.get();
    selected[type] = num;
    Template.instance().selectedArmy.set(selected);
  },

  'input .setNumSoldierInput': function(event, template) {
    var num = parseInt(event.currentTarget.value);
    var type = this.toString();

    var selected = Template.instance().selectedArmy.get();
    var data = Template.currentData();

    if (data && selected) {
      if (num >= 0 && num <= data[type]) {
        selected[type] = num;
        Template.instance().selectedArmy.set(selected);

        // update slider
        var slider = $('.setNumSoldierSlider[data-type='+type+']');
        slider.val(num);
      }
    } else {
      console.error('no data or selected in input .setNumSoldierInput');
    }
  },

  'click #createArmyButton': function(event, template) {
    var button = event.currentTarget;
    var button_html = $(button).html();
    var alert = template.find('#createArmyAlert');

    $(alert).hide();

    $(button).attr('disabled', true);
    $(button).html('<i class="fa fa-refresh fa-spin"></i> Please Wait');

    var selected = Session.get('selected');

    var instance = Template.instance();
    var data = Template.currentData();
    if (instance && data) {
      Meteor.apply('createArmyFromBuilding', [Session.get('gameId'), selected.type, data._id, instance.selectedArmy.get()], {}, function(error, army) {
        $(button).attr('disabled', false);
        $(button).html(button_html);

        if (error) {
          $(alert).show();
          $(alert).html(error.error);
        } else {
          dInit.select('army', army.x, army.y, army._id);
        }
      });
    }
  }
});


Template.rp_createArmy.onCreated(function() {
  var selectedArmy = {};

  _.each(_s.armies.types, function(type) {
    selectedArmy[type] = 0;
  });

  this.selectedArmy = new ReactiveVar(selectedArmy);
});


Template.rp_createArmy.onRendered(function() {
  this.autorun(function() {
    var data = Template.currentData();
    if (data) {

      _.each(_s.armies.types, function(type) {
        this.$('.setNumSoldierSlider[data-type='+type+']').attr('max', data[type])
        this.$('.setNumSoldierSlider[data-type='+type+']').attr('min', 0)

        if (data[type] == 0) {
          this.$('.setNumSoldierSlider[data-type='+type+']').prop('disabled', true)
        } else {
          this.$('.setNumSoldierSlider[data-type='+type+']').prop('disabled', false)
        }
      });
    }
  });
});
