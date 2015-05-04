
// Convert a string value to Boolean
// Any string that is 'True' (case ignored) is True.
// Any other string is false.
String.prototype.toBoolean = function() {
	return (this.toLowerCase() == "true");
}
