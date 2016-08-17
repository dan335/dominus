seperate_number_with_commas = function(x) {
    var parts = x.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
}

round_number = function(num) {
	return seperate_number_with_commas(Math.floor(num))
}

round_number_1 = function(num) {
	return seperate_number_with_commas(Math.floor(num * 10) / 10)
}

round_number_2 = function(num) {
	return seperate_number_with_commas(Math.floor(num * 100) / 100)
}

hex_link = function(text) {
  /* regex: looks for coordinates like 43,-55. includes optional minus sign.
  allows coordinates with 3 digits and optional spaces in between.*/
  var regex = /(-?\d{1,3})\s?,\s?(-?\d{1,3})/g;
  text = text.replace(regex, function(match, p1, p2) {


    var hexLink = document.createElement('a');
    hexLink.setAttribute('class', 'hex-link');
    hexLink.setAttribute('href', '');
    hexLink.dataset.x = p1;
    hexLink.dataset.y = p2;
    hexLink.innerHTML = match;

    var tmp = document.createElement("div");
    tmp.appendChild(hexLink);

    return tmp.innerHTML;
  });

  return text;
};

/////////////////////////////////////////////////////////////////////////////////
// User Properties
/////////////////////////////////////////////////////////////////////////////////

/*
 * Sometimes, Meteor.userId() is not available, such as in publish functions.
 * If this is the case, pass the userId in to the function manually.
 */
get_user_property = function (property, userId) {
	var fields = {}
	fields[property] = 1
	var userId = userId || Meteor.userId()
	var user = Meteor.users.findOne(userId, {fields: fields})
	if (user) {
		return user[property]
	}
}



// clone object before returning so that it doesn't return a reference
cloneObject = function(obj){
	if(obj == null || typeof(obj) != 'object')
		return obj;

	var temp = obj.constructor(); // changed

	for(var key in obj)
		temp[key] =	this.cloneObject(obj[key]);
	return temp;
}


cloneArray = function(arr) {
	return arr.slice(0)
}
