
// Convert a string value to Boolean
// Any string that is 'True' (case ignored) is True.
// Any other string is false.
String.prototype.toBoolean = function() {
	return (this.toLowerCase() == "true");
}

//Prototype function to be able to sort an array of objects by a particular parameter
//http://stackoverflow.com/questions/19487815/passing-additional-parameters-in-the-comparefunction-of-sort-method
Array.prototype.sortByParameter = function (sortParameter, invert) {
	invert = (typeof invert === "undefined" || typeof invert !== "boolean") ? false : invert;
	function compare(a, b) {
		var left;
		var right;

		switch (sortParameter) {	//use switch in case I have to add more options later
			case "position":
				left = (a.position == -1) ? 999 : a.position;
				right = (b.position == -1) ? 999 : b.position;
				break;
			default:
				left = a[sortParameter];
				right = b[sortParameter];
				break;
		}

		if (left < right) {
			console.log("["+left+"] < ["+right+"]");
			return -1;
		}
		if (left > right) {
			console.log("["+left+"] > ["+right+"]");
			return 1;
		}
		console.log("["+left+"] == ["+right+"]");
		return 0;
	}
	this.sort(compare);
	if (invert) {
		this.reverse();
	}
	return this;
}