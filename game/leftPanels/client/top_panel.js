Template.top_panel.helpers({
  serverTime: function() {
    Session.get('refresh_time_field');
    return moment().tz('UTC').format('h:mma');
  }
})
