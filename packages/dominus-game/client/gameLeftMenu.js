Template.gameLeftMenu.helpers({
  _sPanels: function() {
    return _s.panels;
  },

  utctime: function() {
    Session.get('refresh_time_field');
    return moment().tz('UTC').format('h:mma');
  }
})


Template.gameLeftMenuPanelIcon.helpers({
  isOpen: function() {
    var data = Template.currentData();
    let panelsOpen = Session.get('leftPanelsOpen');
    if (_.contains(panelsOpen, data.template)) {
      return 'open';
    }
  },

  hasUnreadAlerts: function() {
    var data = Template.currentData();
    if (data && data.template == 'alerts_panel') {
      if (UnreadAlerts.find().count() > 0) {
        return 'highlighted';
      }
    }
  },

  isHighlighted: function() {
    var highlighted = false;
    let data = Template.currentData();
    if (data.template == 'chatrooms_panel') {
  		//var page_title = s.game_name + " : " + _.capitalize(Meteor.settings.public.GAME_ID);

  		Roomlist.find().forEach(function(room) {
  			//Do not check if room has new notifications if we are hiding room notifications.
  			var hideRoomNotifications = ReactiveCookie.get('room_'+room._id+'_hideNotifications');
  			if (!hideRoomNotifications) {

  				var selectedId = Session.get('selectedChatroomId');
  				// if (room._id == selectedId) {
          //
          // } else {
  					var recent = Recentchats.findOne({room_id:room._id})
  					if (recent) {
  						var latest_open = ReactiveCookie.get('room_'+room._id+'_open')
  						if (latest_open) {
  							if (moment(new Date(recent.updated_at)).isAfter(moment(new Date(latest_open)))) {
                  highlighted = true;
  							}
  						} else {
  							// they don't have a cookie so give them one
  							// var date = new Date()
  							// Cookie.set('room_'+room._id+'_open', moment(date).subtract(1, 's').toDate(), {years: 10})
  							// isNew = true
  						}
  					}
  				//}
  			}
  		});
    }

    if (highlighted) {
      return 'highlighted';
    }
  }
})


Template.gameLeftMenuPanelIcon.events({
  'click .gameLeftMenuPanelIcon': function(event, template) {
    event.preventDefault();

    var data = Template.currentData();
    let panelsOpen = Session.get('leftPanelsOpen');

    if (_.contains(panelsOpen, data.template)) {
      panelsOpen = _.without(panelsOpen, data.template);
    } else {
      panelsOpen = _.union(panelsOpen, data.template);
    }

    Session.set('leftPanelsOpen', panelsOpen);
  }
})


Template.gameLeftMenu.onCreated(function() {
  Session.setDefault('leftPanelsOpen', []);

  this.autorun(function() {
    let playerId = Session.get('playerId');
    if (playerId) {
      let player = Players.findOne(playerId, {fields: {hideAlertsMine:1}});
      if (player) {
        Meteor.subscribe('unreadAlerts', playerId, player.hideAlertsMine);
      }
    }
  })
})
