var background = chrome.extension.getBackgroundPage();

// Convert a string value to Boolean
// Any string that is 'True' (case ignored) is True.
// Any other string is false.
String.prototype.toBoolean = function() {
	return (this.toLowerCase() == "true");
}

function restoreOptions() {
	$('#address').val(localStorage.delugeAddress);
	$('#password').val(localStorage.delugePassword);
	$('#handle_torrent_links').attr('checked', localStorage.delugeDownloadIcon.toBoolean());
	$('#handle_magnet_links').attr('checked', localStorage.oneClickMagnets.toBoolean());
	$('#enable_context_menu').attr('checked', localStorage.contextMenu.toBoolean());
	$('#enable_debug_mode').attr('checked', localStorage.debugMode.toBoolean());
}

function saveOptions() {
	var addressVal				= $('#address').val();
	var passwordVal				= $('#password').val();
	var handleTorrentLinks		= $('#handle_torrent_links').is(':checked');
	var handleMagnetLinks		= $('#handle_magnet_links').is(':checked');
	var contextMenuEnabled		= $('#enable_context_menu').is(':checked');
	var debugMode				= $('#enable_debug_mode').is(':checked');

	var messages				= [];
	var messageText				= '';

	if (addressVal) {
		addressVal = addressVal.replace(/\/$/, '');
		if (localStorage.delugeAddress != addressVal) {
			messages.push('Address updated.');
			localStorage.delugeAddress = addressVal;
		}
	}

	if (passwordVal && localStorage.delugePassword != passwordVal) {
		messages.push('Password updated.');
		localStorage.delugePassword = passwordVal;
	}

	if (String(handleTorrentLinks) != localStorage.delugeDownloadIcon) {
		messages.push("Download torrent icon " + ((handleTorrentLinks) ? "en" : "dis") + "abled!");
		localStorage.delugeDownloadIcon = handleTorrentLinks;
	}

	if (String(handleMagnetLinks) != localStorage.oneClickMagnets) {
		messages.push("One click magnet downloads " + ((handleMagnetLinks) ? "en" : "dis") + "abled!");
		localStorage.oneClickMagnets = handleMagnetLinks;
	}

	if (String(contextMenuEnabled) != localStorage.contextMenu) {
		messages.push("Context Menu " + ((contextMenuEnabled) ? "en" : "dis") + "abled!");
		localStorage.contextMenu = contextMenuEnabled
	}

	background.Background.ContextMenu(contextMenuEnabled);

	if (String(debugMode) !== localStorage.debugMode) {
		messages.push("Debug mode " + ((debugMode) ? "en" : "dis") + "abled!");
		localStorage.debugMode = debugMode;
	}

	background.Background.checkStatus();

	if (debugMode) {
		console.log('Deluge: options saved!');
	}

	if (messages.length > 0) {
		$.each(messages, function (index, obj) {
			messageText += obj + '<br>';
		});
		messageText += "<br>";
		$('#status-message').finish();
		$('#status-message').html(messageText).fadeIn().delay(5000).fadeOut();
	}
}

$(function() {
	$('.buttons .save').on('click', function () {
		saveOptions();
		window.close();
	});
	$('.buttons .apply').on('click', function () {
		saveOptions();
	});
	$('.buttons .cancel').on('click', function () {
		window.close();
	});
	restoreOptions();
});