Picker.route('/astroepatreon', function(params, req, res, next) {
  HTTP.get('http://astroe.io/patreonsync', {}, (error, result) => {
    if (error) {
      console.log(error);
    } else {
      console.log('notifying astroe of patreon update');
    }
  });
  res.end();
});
