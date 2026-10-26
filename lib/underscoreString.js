// The three underscore.string functions the game uses, as the
// wizonesolutions:underscore-string package (underscore.string 2.3.0) mixed
// them into _. That package declares Meteor 1.x, so it can't load on Meteor 3.
_.mixin({
  // "army" -> "Army"
  capitalize: function(str) {
    str = str == null ? '' : String(str);
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  // trims, and turns each run of whitespace into one space
  clean: function(str) {
    return (str == null ? '' : String(str)).trim().replace(/\s+/g, ' ');
  },

  // "large FARM-house" -> "Large Farm-House"
  titleize: function(str) {
    if (str == null) return '';
    str = String(str).toLowerCase();
    return str.replace(/(?:^|\s|-)\S/g, function(c) { return c.toUpperCase(); });
  }
});
