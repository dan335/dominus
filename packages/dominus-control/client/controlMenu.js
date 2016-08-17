Template.controlMenu.events({
  'click a': function(event, template) {
    event.preventDefault();
    event.stopPropagation();
    var path = ($(event.currentTarget).attr('href'));
    var pathArray = path.split('/');

    if (pathArray[1]) {
      if (pathArray[2]) {
        SimpleRouter.go('/control/'+pathArray[2]);
      } else {
        SimpleRouter.go('/control');
      }
    } else {
      SimpleRouter.go('/');
    }
  },
});
