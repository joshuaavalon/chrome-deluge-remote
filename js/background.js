var Background = (function($) {
	// Store all public methods and attributes.
	var pub = {};
	var statusTimer = null;
	var contextMenu = null;

	//All options are stored in an object
	var options = {};
	//Load the options
	chrome.storage.sync.get(function(items) {
		options = items;
	});
	//Listen for changes
	chrome.storage.onChanged.addListener(function(changes, namespace) {
		for (key in changes) {
			options[key] = storageChange.newValue;
		}
	});


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
								if (options.debug_mode) {
									console.log("Daemon started");
								}
								// Give the Daemon a few seconds to start.
								setTimeout(function () { d.resolve(); }, 2000);
							});
					} else {
						d.resolve();
					}
				})
				.error(function () {
					if (options.debug_mode) {
						console.log("Deluge: Error getting host status");
					}
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
		chrome.extension.sendRequest({ msg: "auto_login_failed" });
	}

	function badgeText(text, colour) {
		chrome.browserAction.setBadgeText({text: text});
		chrome.browserAction.setBadgeBackgroundColor({color: colour});
		setTimeout(function(){
			chrome.browserAction.setBadgeText({text: ""});
		}, options.badge_timeout);
	}

	/*
	 * If we have login details perform a login to the Deluge webUI.
	 */
	pub.login = function () {
		return Deluge.api("auth.login", [options.password]);
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
	pub.checkStatus = function (options) {
		if (options.debug_mode) {
			console.log("Deluge: Checking status");
		}

		// Clear any existing timers.
		clearTimeout(statusTimer);

		var api = Deluge.api("web.connected", [], options)
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
									if (options.debug_mode) {
										console.log("Deluge: Incorrect login details.");
									}
									statusTimer = setTimeout(check_status, STATUS_CHECK_ERROR_INTERVAL);
									pub.deactivate();
									autoLoginFailed();
								}
							})
							.error(function (jqXHR, text, err) {
								if (options.debug_mode) {
									console.log("Deluge: Error logging in");
								}
								pub.deactivate();
							});
					} else {
						if (options.debug_mode) {
							console.log("Deluge: API error occured");
						}
						// Unknown API error, deactivate the extension.
						pub.deactivate();
					}
					// Setup interval for a repeat check.
					statusTimer = setTimeout(pub.checkStatus, STATUS_CHECK_INTERVAL);
				} else {
					// Unknown error (resulting from 500/400 status codes
					// normally); best thing to do is check again, but with a
					// longer interval.
					if (options.debug_mode) {
						console.log("Deluge: Unknown error occured");
					}
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
		if (options.debug_mode) {
			console.log("Deluge: Extension activated");
		}
		chrome.browserAction.setIcon({path: "images/icons/deluge_active.png"});
		chrome.browserAction.setTitle({
			title: chrome.i18n.getMessage("browser_title")
		});
		// Send activation to anything listening.
		chrome.extension.sendRequest({ msg: "extension_activated" });
	};

	/* Disables the extension (status messages, disabling icons, etc..).
	 *
	 * This is normally called after doing a status check, which returned false.
	 */
	pub.deactivate = function () {
		if (options.debug_mode) {
			console.log("Deluge: Extension deactivated");
		}
		chrome.browserAction.setIcon({path: "images/icons/deluge.png"});
		chrome.browserAction.setTitle({
			title: chrome.i18n.getMessage("browser_title_disabled")
		});
		// Send deactivation to anything listening.
		chrome.extension.sendRequest({ msg: "extension_deactivated" });
	};

	/**
	* Add a torrent to Deluge using a URL. This method is meant to be called
	* as part of Chrome extensions messaging system.
	*
	* @see chrome.extension.sendRequest && chrome.extension.onRequest
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
							if (options.debug_mode) {
								console.log("deluge: added torrent to deluge.");
							}
							badgeText("Add", "#00FF00");
							sendResponse({msg: "success", result: obj, error: null});
							return;
						}
						badgeText("Fail", "#FF0000");
						if (options.debug_mode) {
							console.log("deluge: unable to add torrent to deluge.");
						}
						sendResponse({msg: "error", result: null, error: "unable to add torrent to deluge"});
					})
					.error(function (req, status, err) {
						if (options.debug_mode) {
							console.log("deluge: unable to add torrent to deluge.");
						}
						badgeText("Fail", "#FF0000");
						sendResponse({msg: "error", result: null, error: "unable to add torrent to deluge"});
					});
			}

			// Need to get config values to add with the torrent first.
			Deluge.api("core.get_config_values", [["add_paused", "compact_allocation", "download_location",
				"max_connections_per_torrent", "max_download_speed_per_torrent",
				"max_upload_speed_per_torrent", "max_upload_slots_per_torrent",
				"prioritize_first_last_pieces"]])
				.success(function (obj) {
					if (obj) {
						if (options.debug_mode) {
							console.log("deluge: got options!");
						}
						addToDeluge(obj);
						return;
					}
					if (options.debug_mode) {
						console.log("deluge: unable to fetch options.");
					}
					sendResponse({msg: "error", result: null, error: "unable to fetch options."});
				})
				.error(function (req, status, err) {
					if (options.debug_mode) {
						console.log("deluge: unable to fetch options.");
					}
					sendResponse({msg: "error", result: null, error: "unable to fetch options."});
				});
		}

		// First we need to download the torrent file to a temp location in Deluge.
		Deluge.api("web.download_torrent_from_url", [request.url, ""])
			.success(function (obj) {
				if (obj) {
					if (options.debug_mode) {
						console.log("deluge: downloaded torrent.");
					}
					addTorrent(obj);
					return;
				}
				if (options.debug_mode) {
					console.log("deluge: failed to download torrent from URL, no obj or result.");
				}
				sendResponse({msg: "error", result: null, error: "failed to download torrent from URL."});
			})
			.error(function (req, status, err) {
				if (options.debug_mode) {
					console.log("deluge: failed to download torrent from URL.");
				}
				sendResponse({msg: "error", result: null, error: "failed to download torrent from URL."});
			});
	};

	/**
	* Add a torrent to Deluge using a magnet URL. This method is meant to be called
	* as part of Chrome extensions messaging system.
	*
	* @see chrome.extension.sendRequest && chrome.extension.onRequest
	*/
	pub.addTorrentFromMagnet = function (request, sender, sendResponse) {
		Deluge.api("core.add_torrent_magnet", [request.url, ""])
			.success(function (id) {
				if (id) {
					if (options.debug_mode) {
						console.log("deluge: downloaded torrent.");
					}
					badgeText("Add", "#00FF00");
					sendResponse({msg: "success", result: id, error: null});
					return;
				}
				if (options.debug_mode) {
					console.log("deluge: failed to add torrent from magnet, no obj or result.");
				}
				badgeText("Fail", "#FF0000");
				sendResponse({msg: "error", result: null, error: "failed to add torrent from magnet."});
			})
			.error(function (req, status, err) {
				if (options.debug_mode) {
					console.log("deluge: failed to add torrent from magnet.");
				}
				badgeText("Fail", "#FF0000");
				sendResponse({msg: "error", result: null, error: "failed to add torrent from magnet."});
			});
	}
	
	function handleContextMenuClick(OnClickData) {
		var torrentUrl = OnClickData.linkUrl;
		if (torrentUrl.search(/\/(download|get)\//) > 0 || torrentUrl.search(/\.torrent$/) > 0) {
			Background.addTorrentFromUrl({url: torrentUrl}, [], function (response) {
				if (response.msg === "success") {
					if (Global.getDebugMode) {
						console.log("Deluge: Torrent added");
					}
				} else {
					if (Global.getDebugMode) {
						console.log("Deluge: Torrent could not be added");
					}
				}
			});
		} else if (torrentUrl.search(/magnet:/) != -1) {
			Background.addTorrentFromMagnet({url: torrentUrl}, [], function (response) {
				if (response.msg === "success") {
					if (Global.getDebugMode) {
						console.log("Deluge: Torrent added");
					}
				} else {
					if (Global.getDebugMode) {
						console.log("Deluge: Torrent could not be added");
					}
				}
			});
		} else {
			if (options.debug_mode) {
				console.log("Deluge: Link not a torrent!");
			}
		}

		return false;
	}

	pub.ContextMenu = function (addremove) {
		if (addremove) {
			this.addContextMenu;
		} else {
			this.removeContextMenu;
		}
	};

	pub.addContextMenu = function () {
		if (contextMenu === null) {
			contextMenu = chrome.contextMenus.create({
				"title": "Add to Deluge",
				"contexts": ["link"],
				"onclick" : handleContextMenuClick
			});
		}
	};

	pub.removeContextMenu = function () {
		if (contextMenu  !== null) {
			chrome.contextMenus.remove(contextMenu);
			contextMenu = null;
		}
	};

	if (options.context_menu) {
		pub.addContextMenu();
	} else {
		pub.removeContextMenu();
	}

	pub.getVersion = function(sendResponse) {
		Deluge.api("daemon.info")
			.success(function (version) {
				if (options.debug_mode) {
					console.log("deluge: got version.");
				}
				version = version.split("-")[0].split(".");
				sendResponse({major: Number(version[0]), minor: Number(version[1]), build: Number(version[2])});
			})
			.error(function (req, status, err) {
				if (options.debug_mode) {
					console.log("deluge: failed to get version.");
				}
				sendResponse(0);
			});
	}

	return pub;
}(jQuery));

// Run init stuff for the plugin.
jQuery(document).ready(function ($) {
	Background.checkStatus();
});

/*
* =====================================================================
* Event bindings.
* =====================================================================
*/

// Any requests send via chrome ext messaging system.
chrome.extension.onMessage.addListener(function (request, sender, sendResponse) {

	switch(request.method) {
		case "options":
			sendResponse(
				{
					"value": options[request.key]
				}
			);
			break;
		case "add_torrent_from_url":
			Background.addTorrentFromUrl(request, sender, sendResponse);
			break;
		case "add_torrent_from_magnet":
			Background.addTorrentFromMagnet(request, sender, sendResponse);
			break;
		default:
			sendResponse({msg: "error", result: null, error: "nothing called!"});
	}

});

