// Game code draws its random numbers from dRandom instead of Math.random(),
// _.random(), _.shuffle() and Random.id(), so tests can seed them (T6 of the Meteor upgrade
// plan). Unseeded, each call is exactly the call it replaces.

dRandom = {
  // a Random generator while seeded, otherwise null
  _generator: null,

  // like Math.random(): 0 <= n < 1
  fraction: function() {
    return this._generator ? this._generator.fraction() : Math.random();
  },

  // like _.random(min, max), or _.random(max) for 0 to max: an integer, both ends included
  random: function(min, max) {
    if (!this._generator) {
      return _.random(min, max);
    }
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(this._generator.fraction() * (max - min + 1));
  },

  // like _.shuffle(list): a shuffled copy
  shuffle: function(list) {
    if (!this._generator) {
      return _.shuffle(list);
    }
    var copy = _.toArray(list);
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(this._generator.fraction() * (i + 1));
      var temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  },

  // like Random.id(): a document id
  id: function() {
    return this._generator ? this._generator.id() : Random.id();
  },

  // --- tests only ---

  isSeeded: function() {
    return this._generator !== null;
  },

  // the same seed gives the same numbers in the same order
  seed: function(seed) {
    refuseInProduction('dRandom.seed');
    this._generator = Random.createWithSeeds(String(seed));
  },

  // back to Math.random
  reset: function() {
    this._generator = null;
  }
};
