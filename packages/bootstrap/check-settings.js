// Displays warning if no bootstrap settings json file is present
if (Meteor.isClient) {
  Meteor.startup(function () {
    if (!Meteor._bootstrapSettingsFileLoaded) {
      console.warn("Bootstrap disabled. Create a file named 'bootstrap-settings.json' to enable.");
    } else {
      try {
        Meteor._bootstrapSettingsFileLoaded = undefined;
        delete Meteor._bootstrapSettingsFileLoaded;
      } catch (e) {}
    }
  });
}
