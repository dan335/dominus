// hold template handles so that they can be removed
markerTemplateHandles = {};


Template.markerGroup.helpers({
  isDefault: function() {
    var data = Template.currentData();
    if (data) {
      return data.groupId === 0;
    }
  },

  isSelected: function() {
    var selected = Session.get('selected');
    if (selected && selected.type == 'markerGroup') {
      var data = Template.currentData();
      return selected.id == data.groupId;
    }
  }
})


Template.markerGroup.events({
  'click .editGroupButton': function(event, template) {
    event.preventDefault();
    var data = Template.currentData();
    if (data) {
      dInit.select('markerGroup', data.x, data.y, data.groupId);
    }
  },

  'click .upGroupButton': function(event, template) {
    event.preventDefault();
    var data = Template.currentData();
    if (data) {
      Meteor.call('moveMarkerGroupUp', data.groupId);
    }
  },

  'click .downGroupButton': function(event, template) {
    event.preventDefault();
    var data = Template.currentData();
    if (data) {
      Meteor.call('moveMarkerGroupDown', data.groupId, data.order);
    }
  },

  'click .removeGroupButton': function(event, template) {
    event.preventDefault();
    var data = Template.currentData();
    if (data) {
      Meteor.call('removeMarkerGroup', data.groupId, data.order);
    }
  }
})




Template.markerGroup.onCreated(function() {
  // this will hold reference to template handles
  var data = Template.currentData();
  markerTemplateHandles[data.groupId] = [];
})


Template.markerGroup.onRendered(function() {
  var self = this;

  self.autorun(function() {
    var data = Template.currentData();

    if (data && data.groupId !== null) {
      var initializing = true;
      var query = Markers.find({groupId:data.groupId}, {sort:{order:1}});
      var documents = [];

      var handle = query.observe({
        addedAt: function(document, atIndex, before) {
          documents.splice(atIndex, 0, document);
          if (!initializing) {
            Tracker.nonreactive(function() {
              renderMarkerTemplates(documents, data.groupId, initializing);
            })
          }
        },
        removedAt: function(document, atIndex) {
          documents.splice(atIndex, 1);
          if (!initializing) {
            Tracker.nonreactive(function() {
              renderMarkerTemplates(documents, data.groupId, initializing);
            })
          }
        },
        changedAt: function(newDoc, oldDoc, atIndex) {
          // if order and group are the same then re-render templates
          // means info changed, marker was edited
          if (oldDoc.order == newDoc.order && oldDoc.groupId == newDoc.groupId) {
            Tracker.nonreactive(function() {
              documents.splice(atIndex, 1, newDoc);
              renderMarkerTemplates(documents, data.groupId, false);
            })
          }
        }
      });

      if (initializing) {
        Tracker.nonreactive(function() {
          renderMarkerTemplates(documents, data.groupId, initializing);
        })
      }

      initializing = false;
    }

  })
})



renderMarkerTemplates = function(documents, groupId, initializing) {
  var ulHandle = $('.markerList[data-groupid="'+groupId+'"]');

  // remove marker templates
  _.each(markerTemplateHandles[groupId], function(handle) {
    Blaze.remove(handle);
  })
  markerTemplateHandles[groupId] = [];

  // add new ones
  _.each(documents, function(doc) {
    var templateHandle = Blaze.renderWithData(Template.markerBox, doc, ulHandle[0]);
    markerTemplateHandles[groupId].push(templateHandle);
  })

  // setup dragging/sorting
  if (initializing) {

    ulHandle.sortable({
      handle: '.handleMarker',
      connectWith: 'markerList',
      forcePlaceholderSize: true
    }).bind('sortupdate', function(e, ui) {
      var fromGroupId = ui.startparent.data('groupid');
      var toGroupId = ui.endparent.data('groupid');
      var oldIndex = ui.oldElementIndex;
      var newIndex = ui.elementIndex;
      var id = ui.item.data('id');

      Meteor.call('setMarkerOrder', id, fromGroupId, toGroupId, oldIndex, newIndex);
    });

  } else {
    ulHandle.sortable();
  }

}
