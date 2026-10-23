Template.control_kuestats.helpers({
  kuestats: function() {
    return KueStats.find({}, {sort: {totalDuration:-1}});
  },

  humanizeDuration: function(num) {
    if (num) {
      var dur = moment.duration(Math.round(num))
      var ms = dur.milliseconds()
      var sec = dur.seconds()
      var min = dur.minutes()
      var hours = dur.hours()

      var str = ''

      if (hours) {
          str += hours+':'
      }

      if (min) {
          str += min+':'
      }

      if (sec) {
          str += sec+'.'
      }

      if (ms) {
          str += ms
      }

      return str
    }
  },

  round: function(num) {
    if (num) {
      var parts = num.toString().split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return parts.join(".");
    } else {
      return '-';
    }
  },

  lastRunCalendar: function() {
      return moment(new Date(this.lastDate)).calendar()
  },

  average: function() {
      return this.totalDuration / this.timesRun
  },

  // JobWorkStats summed over every day, one row per job type, slowest first
  jobworkstats: function() {
    var today = new Date().toISOString().slice(0, 10);
    var rows = {};
    JobWorkStats.find({}, {sort: {day:1}}).forEach(function(doc) {
      var row = rows[doc.type] = rows[doc.type] || {type:doc.type, days:0, count:0, total:0, max:0, maxToday:0, last:0};
      row.days++;
      row.count += doc.count;
      row.total += doc.total;
      row.max = Math.max(row.max, doc.max);
      row.last = doc.last;
      if (doc.day == today) {
        row.maxToday = doc.max;
      }
    });
    return _.sortBy(_.map(rows, function(row) {
      row.avgDuration = row.count ? row.total / row.count : 0;
      return row;
    }), function(row) { return -row.max; });
  },
});


Template.control_kuestats.events({
  'click #runBullJobButton': function(event, template) {
    event.preventDefault();

    var name = template.find('#runJobNameInput');
    var data = template.find('#runJobDataInput');
    var button = event.currentTarget;
    var buttonText = $(button).text();

    $(button).attr('disabled', true);
		$(button).html('<i class="fa fa-refresh fa-spin"></i> Please Wait');

    let jsonData = EJSON.parse(data.value);

    Meteor.call('runBullJob', name.value, jsonData, function(error, result) {
      if (error) {
        console.error(error);
      }
      $(button).attr('disabled', false);
      $(button).html(buttonText);
    })
  },

  'click #startKueButton': function(event, template) {
    event.preventDefault();
    Meteor.call('resumeJobQueue');
  },

  'click #stopKueButton': function(event, template) {
    event.preventDefault();

    var button = event.currentTarget;
    var buttonText = $(button).text();

    $(button).attr('disabled', true);
		$(button).html('<i class="fa fa-refresh fa-spin"></i> Stopping');

    Meteor.call('pauseJobQueue', function(error, result) {
      if (error) {
        console.error(error);
      }
      $(button).attr('disabled', false);
      $(button).html(buttonText);
    });
  },

  'click #runClearUniquesButton': function(event, template) {
    event.preventDefault();

    var jobName = template.find('#clearUniquesInput');
    var button = event.currentTarget;
    var buttonText = $(button).text();

    $(button).attr('disabled', true);
		$(button).html('<i class="fa fa-refresh fa-spin"></i> Please Wait');

    Meteor.call('clearUniqueIdsForJob', jobName.value, function(error, result) {
      if (error) {
        console.error(error);
      }
      $(button).attr('disabled', false);
      $(button).html(buttonText);
    });
  },

  'click #resetQueueStatsButton': function(event, template) {
    event.preventDefault();

    Meteor.call('resetQueueStats');
  }
})

Template.control_kuestats.onCreated(function() {
  this.subscribe('kuestats');
  this.subscribe('jobworkstats');
})
