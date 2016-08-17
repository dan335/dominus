dInit.select = function(type, x, y, id) {
  let url = '/game/'
  url += Session.get('gameId');
  url += '/'+type;
  url += '/'+x;
  url += '/'+y;
  if (id) {
    url += '/'+id;
  }
  SimpleRouter.go(url);
}

dInit.deselect = function() {
  SimpleRouter.go('/game/'+Session.get('gameId'));
}

// to return rightPanel to what's in the url
// use when player hits cancel button in a right panel menu
dInit.returnToSelected = function() {
  SimpleRouter.go(SimpleRouter.path.get());
}
