var Background = null;

function getBackground ($) {
	// Store all public methods and attributes.
	var pub = {};
	var statusTimer = null;
	var contextMenu = null;

	//This line is not necessary, but it prevents an error in the background page later on.
	//If the extension loads and tries to add a context menu while the context menu already exists from previous load, an error occurs.
	//This is NOT a problem either way, but it's nice to keep the console clear.
	chrome.contextMenus.removeAll();

	/*
	 * Intervals used for status checking.
	 * If an error occurs when checking the status then increase how often
	 * things are checked.
	 */
	const STATUS_CHECK_ERROR_INTERVAL = 120000;
	const STATUS_CHECK_INTERVAL = 60000;

	/*
	 * Start the daemon for a given host id.
	 */
	function startDaemon(hostId) {
		// Attempt start the Daemon if not already.
		var deferred = $.Deferred(function (d) {
			// Find the current status of the daemon.
			Deluge.api("web.get_host_status", [hostId])
				.success(function (response) {
					if (response && response[3] === "Offline") {
						Deluge.api("web.start_daemon", [response[2]])
							.success(function (response) {
								debug_log("Daemon started");
								// Give the Daemon a few seconds to start.
								setTimeout(function () { d.resolve(); }, 2000);
							});
					} else {
						d.resolve();
					}
				})
				.error(function () {
					debug_log("Deluge: Error getting host status");
					d.reject();
				});
		});

		return deferred.promise();
	}

	/*
	 * Called when auto login failed - normally incorrect login details.
	 */
	function autoLoginFailed() {
		// Inform anyone who's listening.
		chrome.runtime.sendMessage({ msg: "auto_login_failed" });
	}

	function badgeText(text, colour) {
		debug_log("badgeText: "+text+", "+colour);
		chrome.browserAction.setBadgeText({"text": text});
		chrome.browserAction.setBadgeBackgroundColor({"color": colour});
		setTimeout(function(){
			chrome.browserAction.setBadgeText({text: ""});
		}, ExtensionConfig.badge_timeout);
	}

	/*
	 * If we have login details perform a login to the Deluge webUI.
	 */
	pub.login = function () {
		return Deluge.api("auth.login", [ExtensionConfig.password]);
	};

	pub.connect = function () {
		// Find a list of hosts; if we only have one option connect to it,
		// otherwise do nothing, as we can't handle these at the moment.
		var deferred = $.Deferred(function (d) {
			Deluge.api("web.get_hosts")
				.success(function (response) {
					// Only one host found.
					if (response.length === 1) {
						var hostId = response[0][0];
						// Check the daemon is running and then try connecting.
						startDaemon(hostId).done(function () {
							Deluge.api("web.connect", [hostId])
								.success(function () { d.resolve(); })
								.error(function () { d.reject(); });
						});
					} else {
						d.reject({ error: "More than one host" });
					}
				});
		})
			, promise = deferred.promise();
		// Setup some alias that are expected.
		promise.success = deferred.done;

		return deferred;
	};

	/*
	 * Talk to Deluge to find out if the WebUI is running and that we have access.
	 *
	 * @return API promise - can attach additional success/error callbacks.
	 * */
	pub.checkStatus = function (params) {
		debug_log("Deluge: Checking status");

		// Clear any existing timers.
		clearTimeout(statusTimer);

		var api = Deluge.api("web.connected", [], params)
			.success(function (response) {
				// Connected: activate the extension.
				if (response === true) {
					pub.activate();
					statusTimer = setTimeout(pub.checkStatus, STATUS_CHECK_INTERVAL);
				} else {
					// Authenticated but not connected - attempt to connect to
					// daemon.
					pub.connect().done(function () {
						pub.activate();
						// Create timer.
						statusTimer = setTimeout(pub.checkStatus, STATUS_CHECK_INTERVAL);
					});
				}
			})
			.error(function (jqXHR, text, err) {
				if (text === Deluge.API_ERROR) {
					// If unauthenticated then attempt login.
					if (err.code === Deluge.API_AUTH_CODE) {
						// Login and then check status again!
						pub.login()
							.success(function (res) {
								// If successful check status again now.
								if (res === true) {
									pub.checkStatus();
								} else {
									// Wrong login - not much we can do, try
									// checking in a bit.
									debug_log("Deluge: Incorrect login details.");
									statusTimer = setTimeout(check_status, STATUS_CHECK_ERROR_INTERVAL);
									pub.deactivate();
									autoLoginFailed();
								}
							})
							.error(function (jqXHR, text, err) {
								debug_log("Deluge: Error logging in");
								pub.deactivate();
							});
					} else {
						debug_log("Deluge: API error occured");
						// Unknown API error, deactivate the extension.
						pub.deactivate();
					}
					// Setup interval for a repeat check.
					statusTimer = setTimeout(pub.checkStatus, STATUS_CHECK_INTERVAL);
				} else {
					// Unknown error (resulting from 500/400 status codes
					// normally); best thing to do is check again, but with a
					// longer interval.
					if (jqXHR.status == 0 && text == "error") {
						debug_log("Error: Internet disconnected");
					} else {
						debug_log("Unknown error occured");
					}
					//debug_log(jqXHR.statusCode()); debug_log(text); debug_log(err);
					statusTimer = setTimeout(pub.checkStatus, STATUS_CHECK_ERROR_INTERVAL);
					pub.deactivate();
				}
			});

		return api;
	};

	/*
	 * Enable the extension (set correct status messages and enable icons).
	 *
	 * This is normally called after doing a status check which returned
	 * successfully.
	 */
	pub.activate = function () {
		debug_log("Deluge: Extension activated");
		chrome.browserAction.setIcon({path: "images/icons/deluge_active.png"});
		chrome.browserAction.setTitle({
			title: chrome.i18n.getMessage("browser_title")
		});
		// Send activation to anything listening.
		chrome.runtime.sendMessage({ msg: "extension_activated" });
	};

	/* Disables the extension (status messages, disabling icons, etc..).
	 *
	 * This is normally called after doing a status check, which returned false.
	 */
	pub.deactivate = function () {
		debug_log("Extension deactivated");
		chrome.browserAction.setIcon({path: "images/icons/deluge.png"});
		chrome.browserAction.setTitle({
			title: chrome.i18n.getMessage("browser_title_disabled")
		});
		// Send deactivation to anything listening.
		chrome.runtime.sendMessage({ msg: "extension_deactivated" });
	};

	/**
	* Add a torrent to Deluge using a URL. This method is meant to be called
	* as part of Chrome extensions messaging system.
	*
	* @see chrome.runtime.sendMessage && chrome.runtime.onMessage
	*/
	pub.addTorrentFromUrl = function (request, sender, sendResponse) {
		/**
		 * Fetches the configuration values needed to add the torrent before
		 * adding the torrent to Deluge.
		 *
		 * @param {String} tmpTorrent The temp path to the downloaded torrent file (used by deluge to find the torrent).
		 */
		function addTorrent(tmpTorrent) {
			/**
			 * Add the torrent file into Deluge with the correct options.
			 *
			 * @param {Object} options The options for the torrent (download_path, max_connections, etc...).
			 */
			function addToDeluge(options) {
				Deluge.api("web.add_torrents", [[{"path": tmpTorrent, "options": options}]])
					.success(function (obj) {
						if (obj) {
							debug_log("Deluge: added torrent to deluge.");
							badgeText("Add", "#00FF00");
							chrome.tabs.sendMessage(sender.tab.id, {msg: "Deluge: Success adding torrent!"});
							return;
						}
						badgeText("Fail", "#FF0000");
						debug_log("Deluge: unable to add torrent to deluge.");
						chrome.tabs.sendMessage(sender.tab.id, {msg: "Deluge: Unable to add torrent to deluge"});
					})
					.error(function (req, status, err) {
						debug_log("deluge: unable to add torrent to deluge.");
						badgeText("Fail", "#FF0000");
						chrome.tabs.sendMessage(sender.tab.id, {msg: "Unable to add torrent to deluge"});
					});
			}

			// Need to get config values to add with the torrent first.
			Deluge.api("core.get_config_values", [["add_paused", "compact_allocation", "download_location",
				"max_connections_per_torrent", "max_download_speed_per_torrent",
				"max_upload_speed_per_torrent", "max_upload_slots_per_torrent",
				"prioritize_first_last_pieces"]])
				.success(function (obj) {
					if (obj) {
						debug_log("Deluge: got options!");
						addToDeluge(obj);
						return;
					}
					debug_log("Deluge: unable to fetch options.");
					chrome.tabs.sendMessage(sender.tab.id, {msg: "Deluge: Unable to fetch options."});
				})
				.error(function (req, status, err) {
					debug_log("Deluge: unable to fetch options.");
					chrome.tabs.sendMessage(sender.tab.id, {msg: "Unable to fetch options."});
				});
		}

		// First we need to download the torrent file to a temp location in Deluge.
		debug_log("Sending URL to deluge");
		Deluge.api("web.download_torrent_from_url", [request.url, ""])
			.success(function (obj) {
				if (obj) {
					debug_log("Deluge: downloaded torrent.");
					addTorrent(obj);
					return;
				}
				debug_log("Deluge: failed to download torrent from URL, no obj or result.");
				chrome.tabs.sendMessage(sender.tab.id, {msg: "Deluge: failed to download torrent from URL, no obj or result."});
				badgeText("Fail", "#FF0000");
			})
			.error(function (req, status, err) {
				debug_log("Failed to send torrent URL to Deluge.");
				chrome.tabs.sendMessage(sender.tab.id, {msg: "Failed to send URL to Deluge."});
				badgeText("Fail", "#FF0000");
			});
	};

	/**
	* Add a torrent to Deluge using a magnet URL. This method is meant to be called
	* as part of Chrome extensions messaging system.
	*
	* @see chrome.runtime.sendMessage && chrome.runtime.onMessage
	*/
	pub.addTorrentFromMagnet = function (request, sender, sendResponse) {
		Deluge.api("core.add_torrent_magnet", [request.url, ""])
			.success(function (id) {
				if (id) {
					debug_log("deluge: downloaded torrent.");
					badgeText("Add", "#00FF00");
					chrome.tabs.sendMessage(sender.tab.id, {msg: "Deluge: Success adding torrent from magnet"});
					return;
				}
				debug_log("Deluge: failed to add torrent from magnet, no obj or result.");
				badgeText("Fail", "#FF0000");
				chrome.tabs.sendMessage(sender.tab.id, {msg: "Deluge: Failed to add torrent from magnet."});
			})
			.error(function (req, status, err) {
				debug_log("Deluge: failed to add torrent from magnet.");
				badgeText("Fail", "#FF0000");
				chrome.tabs.sendMessage(sender.tab.id, {msg: "Failed to add torrent from magnet."});
			});
	}

	function handleContextMenuClick(info, tab) {
		debug_log("Context menu sending link to Deluge: "+info.linkUrl);
		var torrentUrl = info.linkUrl;
		if (torrentUrl.search(/magnet:/) != -1) {
			debug_log("Link is a magnet");
			Background.addTorrentFromMagnet({url: torrentUrl}, [], function (response) {
				if (response.msg === "success") {
					debug_log("Torrent added");
				} else {
					debug_log("Torrent could not be added");
				}
			});
		} else {//if (torrentUrl.search(/\/(download|get)\//) > 0 || torrentUrl.search(/\.torrent$/) > 0) {
			debug_log("Link is a torrent");
			Background.addTorrentFromUrl({url: torrentUrl}, [], function (response) {
				if (response.msg === "success") {
					debug_log("Deluge: Torrent added");
				} else {
					debug_log("Deluge: Torrent could not be added");
				}
			});

		} /*else {
			debug_log("Link not a torrent/magnet!");
		}*/

		return false;
	}

	pub.ContextMenu = function (enabled) {
		debug_log("pub.ContextMenu: "+enabled)
		if (enabled) {
			debug_log("this.addContextMenu");
			this.addContextMenu();
		} else {
			debug_log("this.removeContextMenu");
			this.removeContextMenu();
		}
	};

	pub.addContextMenu = function () {
		debug_log("pub.addContextMenu");
		if (contextMenu === null) {
			contextMenu = chrome.contextMenus.create({
				"id": "context_links",
				"title": "Send to Deluge",
				"contexts":[chrome.contextMenus.ContextType.LINK]
			});
			chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
			debug_log("Created contextMenu");
		}
	};

	pub.removeContextMenu = function () {
		chrome.contextMenus.removeAll();
	};

	pub.ContextMenu(ExtensionConfig.context_menu);

	pub.getVersion = function(sendResponse) {
		Deluge.api("daemon.info")
			.success(function (version) {
				debug_log("deluge: got version.");
				version = version.split("-")[0].split(".");
				sendResponse({major: Number(version[0]), minor: Number(version[1]), build: Number(version[2])});
			})
			.error(function (req, status, err) {
				debug_log("deluge: failed to get version.");
				sendResponse(0);
			});
	}

	return pub;
}

// Run init stuff for the plugin.
function start() {
	if (typeof ExtensionConfig.version === "undefined" || chrome.runtime.getManifest().version.split(".")[0] !== ExtensionConfig.version.split(".")[0]) {
		chrome.tabs.create({ url: "options.html?newver=true" });
	}
	Background = getBackground();
	Background.checkStatus();
}

/*
* =====================================================================
* Event bindings.
* =====================================================================
*/

// Any requests send via chrome ext messaging system.
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
	debug_log("Received message: "+request.method)
	debug_log(request);
	switch(request.method) {
		case "ExtensionConfig":
			sendResponse(
				{
					"value": ExtensionConfig[request.key]
				}
			);
			break;
		case "add_torrent_from_url":
			debug_log("Adding torrent from URL: "+request.url)
			Background.addTorrentFromUrl(request, sender, sendResponse);
			break;
		case "add_torrent_from_magnet":
			Background.addTorrentFromMagnet(request, sender, sendResponse);
			break;
		case "context_menu":
			debug_log("Changing context menu to: " + request.enabled);
			Background.ContextMenu(request.enabled);
			break;
		default:
			sendResponse({msg: "error", result: null, error: "nothing called!"});
	}

});
