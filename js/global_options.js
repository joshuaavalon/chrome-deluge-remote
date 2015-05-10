//All options are stored in an object
var options = {};
//Load the options
chrome.storage.sync.get(function(items) {
	options = items;
});
//Listen for changes
chrome.storage.onChanged.addListener(function(changes, namespace) {
	for (key in changes) {
		options[key] = changes[key].newValue;
	}
});