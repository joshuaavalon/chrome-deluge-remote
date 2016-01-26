//All options are stored in an object
var ExtensionConfig = {
	address_protocol: "http",
	address_ip		: "",
	address_port	: "",
	address_base	: "",
	password		: "",
	handle_magnets	: false,
	handle_torrents	: false,
	context_menu	: false,
	badge_timeout	: 250,
	debug_mode		: false,
};

//Listen for changes
chrome.storage.onChanged.addListener(function(changes, namespace) {
	for (key in changes) {
		ExtensionConfig[key] = changes[key].newValue;
		if (key == "context_menu") {
			chrome.runtime.sendMessage({method: "context_menu", enabled: changes[key].newValue})
		}
	}
});

jQuery(document).ready(function ($) {
	//Load the options
	chrome.storage.sync.get(function(items) {
		ExtensionConfig = items;
		if (chrome.extension.getBackgroundPage && chrome.extension.getBackgroundPage() == window) {	//If running in background page
			start();	//Start the extension - function is located in background.js
		}
	});
});
