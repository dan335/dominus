Template.gamePaused.helpers({
    show: function() {
      let settings = Settings.findOne();
      if (settings) {
        return settings.isPaused;
      }
    }
});
