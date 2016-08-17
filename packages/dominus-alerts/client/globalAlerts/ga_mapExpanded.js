var helpers = {
    title: function() {
        return 'New hexes have been added to the map.'
    }
}


var events = {
  'click .newCountryLink': function(event, template) {
    event.preventDefault();
    var data = Template.currentData();
    if (data) {
      dHexmap.centerOnHex(data.vars.x,data.vars.y);
    }
  }
}


Template.ga_mapExpanded.helpers(_.extend(globalAlertSharedHelpers, helpers))
Template.ga_mapExpanded.events = (_.extend(alertSharedEvents, events));
Template.ga_mapExpanded.rendered = alertSharedRendered



Template.ga_mapExpanded.created = function() {
    var self = this

    self.isOpen = new ReactiveVar(false)
}
