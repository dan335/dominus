Template.reportAlert.helpers({
    show: function() {
        var num = Reports.find().count();
        return num > 0;
    },

    reports: function() {
        var fields = {reason:1, createdAt:1};
        return Reports.find({}, {sort:{createdAt:-1}, fields:fields});
    },

    timeLeft: function() {
      Session.get('refresh_time_field')
      var fields = {createdAt:1};
      var sort = {createdAt:1};
      var oldest = Reports.findOne({}, {sort:sort, fields:fields});
      var numReports = Reports.find().count();
      if (oldest) {
          var reportDate = moment(oldest.createdAt);
          var pastTime = moment() - reportDate;
          var length = reportDuration(numReports);
          var timeLeft = length - pastTime;
          return moment.duration(timeLeft).humanize();
      }
    }
});
