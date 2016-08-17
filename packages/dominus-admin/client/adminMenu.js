Template.adminMenu.events({
  'click a': function(event, template) {
    event.preventDefault();
    var path = ($(event.currentTarget).attr('href'));
    var pathArray = path.split('/');

    if (pathArray[1]) {
      if (pathArray[2]) {
        SimpleRouter.go('/admin/'+pathArray[2]);
      } else {
        SimpleRouter.go('/admin');
      }
    } else {
      SimpleRouter.go('/');
    }

  }
});
