// general functions

dFunc = {
  isInt: function(value) {
    return !isNaN(value) && (function(x) { return (x | 0) === x; })(parseFloat(value))
  },

  // randomize order or array
  // http://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
  shuffleArray: function(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
  }
}
