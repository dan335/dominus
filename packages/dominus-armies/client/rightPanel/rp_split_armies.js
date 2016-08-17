Template.rp_split_armies.helpers({
	num_units: function() {
		var type = Template.currentData();
		var instance = Template.instance();
		if (instance && instance.selectedSoldiers) {
			var selectedSoldiers = instance.selectedSoldiers.get();
			return selectedSoldiers[type];
		}
	},

	old_army: function() {
		var type = Template.currentData();
		var parentData = Template.parentData(1)
		if (parentData) {

			var instance = Template.instance();
			if (instance && instance.selectedSoldiers) {
				var selectedSoldiers = instance.selectedSoldiers.get();

				return Template.parentData(1)[type] - selectedSoldiers[type]
			}
		}
	},
})

Template.rp_split_armies.events({
	'click #split_cancel_button': function(event, template) {
		event.preventDefault();
		Session.set('rp_template', 'rp_info_army')
	},

	'change .split_units_slider, input .split_units_slider': function(event, template) {
		var type = event.currentTarget.getAttribute('data-type')
		var num = Number(event.currentTarget.value)

		var instance = Template.instance();
		if (instance && instance.selectedSoldiers) {
			var selectedSoldiers = instance.selectedSoldiers.get();
			selectedSoldiers[type] = num;
			instance.selectedSoldiers.set(selectedSoldiers);
		}
	},

	'click #split_confirm_button': function(event, template) {
		event.preventDefault();
		var button = template.find('#split_confirm_button')
		var alert = template.find('#split_error')
		var button_html = $(button).html()
		var selected = Session.get('selected');

		if (selected) {
			$(alert).hide()

			$(button).attr('disabled', true)
			$(button).html('Please Wait')

			var instance = Template.instance();
			let gameId = Session.get('gameId');

			Meteor.apply('splitArmy', [gameId, selected.id, instance.selectedSoldiers.get()], {throwStubExceptions:true}, function(error, result) {
				if (error) {
					$(alert).show()
					$(alert).html(error.error)

					$(button).attr('disabled', false)
					$(button).html(button_html)
				} else {
					selected.id = result;
					dInit.select('army', selected.x, selected.y, selected.id);
				}
			})
		}


	}
})


Template.rp_split_armies.onCreated(function() {
	var self = this;

	var selected = {};
	_s.armies.types.forEach(function(type) {
		selected[type] = 0;
	})
	self.selectedSoldiers = new ReactiveVar(selected);

	var max = {};
	_s.armies.types.forEach(function(type) {
		max[type] = 0;
	})
	self.maxSoldiers = new ReactiveVar(max);

	// set max and inital selected number
	var firstRun = true;
	self.autorun(function() {

		// if army changes update max
		var army = Template.currentData();
		if (army) {
			var max = {};
			_s.armies.types.forEach(function(type) {
				if (army[type]) {
					max[type] = army[type];
				} else {
					max[type] = 0;
				}
			});
			self.maxSoldiers.set(max);

			// if first run set selected to  half
			if (firstRun) {
				var selected = {}

				_.each(s.army.types, function(type) {
					if (army[type]) {
						selected[type] = Math.floor(army[type] / 2);
					} else {
						selected[type] = 0;
					}
				})

				self.selectedSoldiers.set(selected);

				firstRun = false;
			}
		}
	})
})


Template.rp_split_armies.onRendered(function() {
	var self = this;

	// update max slider if max changes
	this.autorun(function() {
		var max = self.maxSoldiers.get();
		_s.armies.types.forEach(function(type) {
			var slider = this.$('.split_units_slider[data-type='+type+']');
			if (slider) {
				slider.attr('max', max[type]);
				slider.attr('min', 0);

				if (max[type] == 0) {
					slider.prop('disabled', true)
				} else {
					slider.prop('disabled', false)
				}
			}
		})
	})

	// set initial slider values
	var firstRun = true;
	this.autorun(function() {
		var army = Template.currentData();
		if (army) {
			if (firstRun) {
				_s.armies.types.forEach(function(type) {

					var slider = this.$('.split_units_slider[data-type='+type+']')

					slider.val(Math.floor(army[type]/2))
					slider.attr('min', 0)

					if (army[type] == 0) {
						slider.prop('disabled', true)
					} else {
						slider.prop('disabled', false)
					}

				})

				firstRun = false;
			}
		}
	})
})
