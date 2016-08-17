Template.admin.helpers({
  route: function() {
    var path = SimpleRouter.path.get();
    var pathArray = path.split('/');
    return 'admin_'+pathArray[2];
  }
})

Template.admin.onRendered(function() {
    setBackground()
    window.onresize = function() {
        setBackground()
    }
})


var setBackground = function() {
    document.body.style.backgroundColor = '#222';
    document.body.style.backgroundImage = 'none';
}
