// HTTP.get gave an error for a status of 400 or more, and so does this
var notify = function(url, message) {
  return fetch(url).then(async function(response) {
    await response.arrayBuffer();
    if (response.status >= 400) {
      throw new Error('failed [' + response.status + '] ' + url);
    }
    console.log(message);
  }).catch(function(error) {
    console.log(error);
  });
};

HttpRoutes.route('/astroepatreon', function(req, res) {
  void notify('http://astroe.io/patreonsync', 'notifying astroe of patreon update');
  void notify('http://dominus2.io/patreonsync', 'notifying dominus 2 of patreon update');
  res.end();
});
