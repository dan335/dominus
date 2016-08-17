// disabled
leftPanelAnimation = {
	// insertElement: function(node, next) {
	// 	$(node).hide().insertBefore(next).effect('blind', {direction:'left', mode:'show'}, 1500).show()
	// },
	// removeElement: function(node) {
	// 	$(node).effect('blind', {direction:'left', mode:'hide', complete: function() {
	// 		$(node).remove()
	// 	}}, 150)
	// }
}


battleCalculatorAnimation = {
	insertElement: function(node, next) {
		$(node).hide().insertBefore(next).effect('blind', {direction:'up', mode:'show'}, 150).show();
	},
	removeElement: function(node) {
		$(node).effect('blind', {direction:'up', mode:'hide', complete: function() {
			$(node).remove()
		}}, 150)
	},
	moveElement: function(node, next) {
		$(node).slideUp(150, function() {
			$(node).insertBefore(next).slideDown(150);
		})
	}
}
