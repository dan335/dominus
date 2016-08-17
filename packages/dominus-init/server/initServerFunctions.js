// how many hexes are on_screen
// used in publish functions
dInit.maxOnscreen = function(canvas_width, canvas_height, hex_scale) {
	check(canvas_width, validNumber)
	check(canvas_height, validNumber)

	var hex_size = _s.init.hexSize * hex_scale

	var num_wide = canvas_width / (hex_size * 3/2)
	var num_high = canvas_height / ((Math.sqrt(3) * _s.init.hexSquish) * hex_size)

	var max = Math.max(num_wide / 2 + 3, num_high / 2 + 3)

	return max
}
