var lastPos = {x:null,y:null}

dHexmap.mapmover = new Mapmover(function(x,y,scale) {
	// beginning of move
	beginPos = {x:x,y:y}

}, function(x,y,scale) {
	// during move
	dHexmap.offsetHexes(x-lastPos.x, y-lastPos.y)
	dHexmap.setHexScale(scale)
	lastPos = {x:x, y:y}

}, function(x,y,scale) {
	// end of move
	dHexmap.offsetHexes(x-lastPos.x, y-lastPos.y)
	dHexmap.setHexScale(scale)
})

dHexmap.mapmover.throttle = 33;
dHexmap.mapmover.minScale = _s.init.hexScaleMin;
dHexmap.mapmover.maxScale = _s.init.hexScaleMax;
