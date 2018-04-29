Meteor.methods({
  astroepatreon() {
    HTTP.get('http://astroe.io/patreonnotify');
  }
})
