Template.markersPanel.helpers({
  groups: function() {
    return MarkerGroups.find({}, {sort:{order:1}});
  },

  numMarkers: function() {
    return Markers.find().count();
  },

  maxMarkers: function() {
    let playerId = Session.get('playerId');
    if (playerId) {
      let player = Players.findOne(playerId, {fields: {pro:1}});
      if (player && player.pro) {
        return _s.markers.maxMarkersPro;
      }
    }
    return _s.markers.maxMarkersNonPro;
  },

  numGroups: function() {
    return MarkerGroups.find().count();
  },

  maxGroups: function() {
    let playerId = Session.get('playerId');
    if (playerId) {
      let player = Players.findOne(playerId, {fields: {pro:1}});
      if (player) {
        return _s.markers.maxGroupsPro;
      }
    }
    return _s.markers.maxGroupsNonPro;
  }
});




Template.markersPanel.events({
  'click #addGroupButton': function(event, template) {
    event.preventDefault();

    var nameInput = template.find('#groupNameInput');
    var name = nameInput.value;
    var button = event.currentTarget;
    var button_html = $(button).html();
    var alert = template.find('#addGroupAlert');

    $(alert).hide();

    $(button).attr('disabled', true);
    $(button).html('<i class="fa fa-refresh fa-spin"></i> Please Wait');

    Meteor.apply('addMarkerGroup', [Session.get('gameId'), name], {}, function(error, result) {
      $(button).attr('disabled', false);
      $(button).html(button_html);

      if (error) {
        $(alert).show();
        $(alert).html(error.error);
      } else {
        $(nameInput).val('');
      }
    });
  },

  'click #markerProUpgradeButton': function(event, template) {
    event.preventDefault();
    Session.set('show_pro_panel', true);
  }
})





Template.markersPanel.onRendered(function() {
  this.firstNode.parentNode._uihooks = leftPanelAnimation;

  // $('.markerList').sortable({
  //   handle: '.handle',
  //   connectWith: 'markerList',
  //   forcePlaceholderSize: true
  // }).bind('sortupdate', function() {
  //   $('.markerList li').each(function(index, value) {
  //
  //     var groupId = $(value).closest('ul').data('groupid');
  //     Meteor.call('setMarkerOrder', $(value).data('id'), index, groupId);
  //
  //   })
  // });
})



Template.markersPanel.onCreated(function() {
  this.autorun(function() {
    let playerId = Session.get('playerId');
    if (playerId) {
      Meteor.subscribe('myMarkerGroups', playerId);
    }
  })
})



/*
add marker at hex/castle/village/army info
shows up in panel
groups, dragging?
select marker in ui or map
shows marker info panel
can edit name and info
name shows on map
share with others
show in mini-map?
*/
