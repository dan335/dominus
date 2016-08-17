var helpers = {
    title: function() {
        if (this) {
            return this.vars.username+' was reported.';
        }
    }
};


Template.ga_playerReported.helpers(_.extend(globalAlertSharedHelpers, helpers));
Template.ga_playerReported.events = alertSharedEvents;
Template.ga_playerReported.rendered = alertSharedRendered;


Template.ga_playerReported.created = function() {
    var self = this;

    self.isOpen = new ReactiveVar(false);
};
