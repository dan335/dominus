var lastPos = {x: null, y: null};
var lastScale = null;

// During long drags, occasionally commit Session so country loading / center_hex
// still track the view (center_hex itself is already debounced 500ms).
// Drag end always does a hard commit.
var commitHexesPosThrottled = _.throttle(function() {
  dHexmap.commitHexesPos();
}, 400);

dHexmap.mapmover = new Mapmover(function(x, y, scale) {
  // beginning of move — sync last* so the first delta is 0
  lastPos = {x: x, y: y};
  lastScale = scale;

}, function(x, y, scale) {
  // during move — visual pan only; avoid Session.set every frame
  dHexmap.offsetHexesVisual(x - lastPos.x, y - lastPos.y);
  if (scale !== lastScale) {
    dHexmap.setHexScale(scale);
    lastScale = scale;
  }
  lastPos = {x: x, y: y};
  commitHexesPosThrottled();

}, function(x, y, scale) {
  // end of move — final visual offset + commit Session once
  dHexmap.offsetHexesVisual(x - lastPos.x, y - lastPos.y);
  if (scale !== lastScale) {
    dHexmap.setHexScale(scale);
    lastScale = scale;
  }
  lastPos = {x: x, y: y};
  dHexmap.commitHexesPos();
});

dHexmap.mapmover.throttle = 33;
dHexmap.mapmover.minScale = _s.init.hexScaleMin;
dHexmap.mapmover.maxScale = _s.init.hexScaleMax;
