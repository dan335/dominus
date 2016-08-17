Template.treeUser.helpers({
    relation: function() {
      if (this && this._id) {
        return dInit.getRelationshipClient(this._id);
      }
    }
});


Template.treeUser.events({
    'click .username': function(event, template) {
      event.preventDefault();
      dInit.select('castle', this.x, this.y, this.castle_id);
      dHexmap.centerOnHex(this.x, this.y);
    }
})
