Meteor.methods({
  astroepatreon() {
    HTTP.get('http://astroe.io/patreonnotify', {}, (error, result) => {
      console.log(result);
    });
  }
})
