// helpers that are used everywhere

Template.registerHelper('s', function() { return s })

Template.registerHelper('date_time', function(jsDate) {
	Session.get('refresh_time_field')
	return moment(new Date(jsDate)).format('h:mm a')
})

Template.registerHelper('date_twitter', function(jsDate) {
	Session.get('refresh_time_field');
	return moment(new Date(jsDate)).twitter();
});

// for input type=date
Template.registerHelper('date_inputDate', function(jsDate) {
	var m = moment(new Date(jsDate));
	return m.format('YYYY-MM-DD');
});
Template.registerHelper('date_inputDateUTC', function(jsDate) {
	var m = moment.utc(new Date(jsDate));
	return m.format('YYYY-MM-DD');
});

// for input type=time
Template.registerHelper('date_inputTime', function(jsDate) {
	var m = moment(new Date(jsDate));
	return m.format('HH:mm');
});
Template.registerHelper('date_inputTimeUTC', function(jsDate) {
	var m = moment.utc(new Date(jsDate));
	return m.format('HH:mm');
});

Template.registerHelper('date_month_day_year', function(jsDate) {
	return moment(new Date(jsDate)).format('M/D/YY')
})



Template.registerHelper('dateUnixOffset', function(date) {
	return new Date(date).getTime()
})

Template.registerHelper('greater_than_zero', function(num) {
	return num > 0
})



Template.registerHelper('random_int_1_to_3', function() {
	return Math.floor(Random.fraction() * 3) + 1
})



Template.registerHelper('round', function(num) {
	if (isNaN(num)) {
		return '-'
	} else {
		return round_number(num)
	}
})

Template.registerHelper('round_1', function(num) {
	if (isNaN(num)) {
		return '-'
	} else {
		return round_number_1(num)
	}
})

Template.registerHelper('round_2', function(num) {
	if (isNaN(num)) {
		return '-'
	} else {
		return round_number_2(num)
	}
})

Template.registerHelper('autolink', function(text, escape) {
	if (escape || escape === undefined){
		text = UI._escape(text)
	}

	return new Spacebars.SafeString(
		Autolinker.link(hex_link(text), {twitter: false})
	);
})

// 1.25 = 25%
Template.registerHelper('multiplierToPercentage', function(float) {
	check(float, validNumber)
	return (float - 1) * 100
})

// 0.25 = 25%
Template.registerHelper('floatToPercentage', function(float) {
	check(float, validNumber)
	return float * 100
})


Session.setDefault('windowHasFocus', true)
jQuery(document).ready(function() {
	jQuery(window).bind('focus', function(event) {
		Session.set('windowHasFocus', true)
	}).bind('blur', function(event) {
		Session.set('windowHasFocus', false)
	})
})
