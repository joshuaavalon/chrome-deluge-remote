/*
 * Responsible for all display, page or functional control on the status page.
 *
 * - Setting refresh timers.
 * - Rendering HTML for table.
 * - Logic for action buttons.
 */
$(function() {
	// Get extension background page for use within the code.
	var backgroundPage = chrome.extension.getBackgroundPage();
		// Store the extension activation state.
	var extensionActivated = false;
	var checked = [];
		// Set the initial height for the overlay.
	var $overlay = $("#overlay").css({ height: $(document).height() });

	// Setup timer information.
	const REFRESH_INTERVAL = 30000;
	var refreshTimer = Timer(REFRESH_INTERVAL);

	// I can't get the popup to play nicely when there is a scroll bar and then
	// when there isn't - so going to adjust the width if a scroll bar is
	// visible (this needs to be done on timeout to give popup time to show).
	//
	// See: http://code.google.com/p/chromium/issues/detail?id=31494
	//
	// Listen for a table refresh event and add the class if needed.
	/*$(document).bind('table_updated', function (e) {
		if ($(document).height() > $(window).height()) {
			$('body').addClass('scrollbars');
		}
	});*/

	/*
	 * Helper function for creating progress bar element.
	 */
	function progressBar(torrent) {
		var $bar = $(document.createElement("div")).addClass("progress_bar");
		$(document.createElement("div"))
			.addClass("inner")
			.addClass(torrent.state)
			.addClass((torrent.is_finished ? "finished" : ""))
			.css("width", torrent.getPercent())
			.appendTo($bar);

		$(document.createElement("span"))
			.html(torrent.getPercent() + " - " + torrent.state)
			.appendTo($bar);

		return $bar;
	}

	function actionLinks(torrent) {
		// Work out which states to use based on torrent information.
		var state = torrent.state === "Paused" ? "resume" : "pause"
		var managed = torrent.autoManaged ? "managed" : "unmanaged";

		return $(document.createElement("div"))
			.addClass("main_actions")
			.append(
				// Pause/Resume buttons.
				$(document.createElement("a")).addClass("state").addClass(state).prop("title", "Pause/Resume Torrent"),
				// Move up button.
				$(document.createElement("a")).addClass("move_up").prop("title", "Move Torrent Up"),
				$(document.createElement("a")).addClass("move_down").prop("title", "Move Torrent Down"),
				// Auto managed options.
				$(document.createElement("a")).addClass("toggle_managed").addClass(managed).prop("title", "Toggle Auto-managed State"),
				$(document.createElement("a")).addClass("force_recheck").prop("title", "Force re-check data"),
				// Delete.
				$(document.createElement("a")).addClass("delete").prop("title", "Delete Options")
			);
	}

	function updateTableDelay(ms) {
		setTimeout(updateTable, ms);
	}

	function updateTable() {
		// Clear out any existing timers.
		refreshTimer.unsubscribe();
		Torrents.update()
			.success(function () {
				renderTable();
				renderGlobalInformation();
				refreshTimer.subscribe(updateTable);
			})
			.error(function () {
				// Problem fetching information, perform a status check.
				// Note: Not setting a timeout, should happen once updateTable
				// gets called when extension check is OK.
				checkStatus();
			});
	}

	/**
	 * Pause the table refresh.
	 */
	function pauseTableRefresh() {
		refreshTimer.unsubscribe();
	}

	 /**
	* Resume the table refresh.
	*/
	function resumeTableRefresh() {
		refreshTimer.unsubscribe();
		refreshTimer.subscribe(updateTable);
	}

	function renderGlobalInformation() {
		var information = Torrents.getGlobalInformation();
		$globalInformation = $("#global-information");

		debug_log(Torrents);
		debug_log(information);

		$(".all", $globalInformation).html(information.all);
		$(".downloading", $globalInformation).html(information.downloading);
		$(".paused", $globalInformation).html(information.paused);
		$(".seeding", $globalInformation).html(information.seeding);
		$(".queued", $globalInformation).html(information.queued);
	}

	function renderTable() {

		//Set the href for the title, because otherwise the options doesn't exist early enough
		$("#deluge_webui_link").attr("href", Deluge.endpoint());

		//clear the table
		$("#torrent_container").empty();

		//sort the torrents - the extra sorts help to group things nicely
		var torrents = Torrents.sort(localStorage.sortColumn || "position").getAll();
		if (localStorage.sortMethod === "desc") {
			torrents.reverse();
		}

		for (var i = 0; i < torrents.length ; i++) {
			var torrent = torrents[i];

			var filter_state = $("#filter_state").val();
			var filter_tracker_host = $("#filter_tracker_host").val();
			var filter_label = $("#filter_label").val();

			if (filter_state == "All" || filter_state == torrent.state || (filter_state == "Active" && (torrent.speedDownload > 0 || torrent.speedUpload > 0)) ) {
				if (filter_tracker_host == "All" || filter_tracker_host == torrent.tracker_host || (filter_tracker_host == "Error" && (torrent.tracker_status.indexOf("Error") > -1)) ) {
					if (filter_label == "All" || filter_label == torrent.label) {

						$("#torrent_container").append($("<div>")
							.data({ id: torrent.id }) /* Store torrent id */
							.addClass("torrent_row")
							.append(
								$("<table>").append($("<tr>").append(
									$("<td>").addClass("table_cell_position").html(torrent.getPosition()),
									$("<td>").addClass("table_cell_name").html(torrent.name)
								)),
								$("<table>").append($("<tr>").append(
									$("<td>").addClass("table_cell_size").html((torrent.progress != 100 ? torrent.getHumanDownloadedSize() + " of " : "" ) + torrent.getHumanSize()), // 
									$("<td>").addClass("table_cell_eta").html("ETA: " + torrent.getEta()),
									$("<td>").addClass("table_cell_ratio").html("Ratio: " + torrent.getRatio()),
									$("<td>").addClass("table_cell_peers").html("Peers: " + torrent.num_peers + "/" + torrent.total_peers),
									$("<td>").addClass("table_cell_seeds").html("Seeds: " + torrent.num_seeds + "/" + torrent.total_seeds),
									//$("<td>").addClass("table_cell_seeds-peers").html("(" + torrent.seeds_peers_ratio.toFixed(1) + ")"), //this doesn't really look good
									$("<td>").addClass("table_cell_speed").html(torrent.getSpeeds())
								)),
								$("<table>").append($("<tr>").append(
									$("<td>").addClass("table_cell_progress").html(progressBar(torrent))
								)),
								$("<table>").append($("<tr>").append(
									$("<td>").addClass("table_cell_actions").append(actionLinks(torrent))
								))
							)
						);

					}
				}
			}

		}

		//$(document).trigger('table_updated');
	}

	(function () {
		function getRowData(element) {
			var parent = $(element).parents(".torrent_row");
			var torrentId = parent.data("id");
			var torrent = Torrents.getById(torrentId);
			return {"torrentId": torrentId, "torrent": torrent};
		}

		var $mainActions = $(".main_actions");

		function DelugeMethod(method, torrent, rmdata) {
			pauseTableRefresh();
			var methods_messages = {
				"core.resume_torrent":				{success: "Deluge: Resumed torrent",			failure: "Deluge: Failed to resume torrent."},
				"core.pause_torrent":				{success: "Deluge: Paused torrent",				failure: "Deluge: Failed to pause torrent."},
				"core.queue_up":					{success: "Deluge: Moved torrent up queue",		failure: "Deluge: Failed to move torrent up queue."},
				"core.queue_down":					{success: "Deluge: Moved torrent down queue",	failure: "Deluge: Failed to move torrent down queue."},
				"core.set_torrent_auto_managed":	{success: "Deluge: Toggled auto-managed.",		failure: "Deluge: Failed to toggle auto-managed."},
				"core.remove_torrent":				{success: "Deluge: Deleted torrent.",			failure: "Deluge: Failed to delete torrent."},
				"core.force_recheck":				{success: "Deluge: Force rechecking torrent.",	failure: "Deluge: Failed to force recheck torrent."}
			};

			var actions;
			if (method == "core.set_torrent_auto_managed") {	//auto-managed toggle has different call format
				actions = [torrent.id, !torrent.autoManaged];
			} else if (method == "core.remove_torrent") {		//remove torrent - if rmdata is true, data is removed as well
				actions = [torrent.id, rmdata];
			} else {
				actions = [[torrent.id]];
			}

			Deluge.api(method, actions)
				.success(function (data, textStatus, jqXHR) {
					debug_log(methods_messages[method].success);
					updateTableDelay(250);
				})
				.error(function () {
					debug_log(methods_messages[method].failure);
				});
		}

		$("#torrent_container").on("click", ".main_actions *", function() {
			var rowData = getRowData(this);
			var method;
			var rmdata = false;
			if ($(this).hasClass("state")) {
				method = rowData.torrent.state === "Paused" ? "core.resume_torrent" : "core.pause_torrent";
			} else if ($(this).hasClass("move_up")) {
				method = "core.queue_up";
			} else if ($(this).hasClass("move_down")) {
				method = "core.queue_down";
			} else if ($(this).hasClass("toggle_managed")) {
				method = "core.set_torrent_auto_managed";
			} else if ($(this).hasClass("force_recheck")) {
				method = "core.force_recheck";
			} else if ($(this).hasClass("rm_torrent_data")) {
				method = "core.remove_torrent";
				rmdata = true;
			} else if ($(this).hasClass("rm_torrent")) {
				method = "core.remove_torrent";
				rmdata = false;
			} else {
				return;
			}
			DelugeMethod(method, rowData.torrent, rmdata);
		});

		$("#torrent_container").on("click", ".main_actions .delete", function() {
			pauseTableRefresh();

			$(".main_actions", $(this).parents("td")).fadeOut(function() {
				$(this).parents("td").append(
					$("<div>")
						.addClass("delete-options")
						.append($("<a>").addClass("rm_cancel").prop("title", "Cancel"))
						.append($("<a>").addClass("rm_torrent_data").prop("title", "Delete with data"))
						.append($("<a>").addClass("rm_torrent").prop("title", "Remove torrent only"))
				).hide().fadeIn();
			});

		});

		$("#torrent_container").on("click", ".delete-options a", function() {
			var action = $(this).attr("rel") || "cancel";
			var delData = (action === "data") ? true : false;
			var torrent = getRowData(this).torrent;

			function removeButtons() {
				// Remove buttons, resume refresh.
				$(".delete-options").fadeOut(function () {
					resumeTableRefresh();
					$(".main_actions", $(this).parents("td")).fadeIn(function() {
						updateTable();
					});
				});
			}

			// If cancelling remove overlay and resume refresh now and return.
			if ($(this).hasClass("rm_cancel")) {
				//removeButtons();
			} else if ($(this).hasClass("rm_torrent")) {
				DelugeMethod("core.remove_torrent", torrent, false);
			} else if ($(this).hasClass("rm_torrent_data")) {
				DelugeMethod("core.remove_torrent", torrent, true);
			} else {
				return false;
			}

			removeButtons();
			return false;

		});

	}());

	(function () {
		$("#add-torrent").click(function(e) {
			e.preventDefault();
			$("#add-torrent-dialog").show();
			$("#add-torrent-dialog").click(function(e) {
				$(this).hide();
			});

			/* Don't closed if clicked within .inner */
			$("#add-torrent-dialog .inner").click(function(e) {
				e.stopPropagation();
			});
		});
		// For some reason the link has focus when the status is shown, however
		// we can't blur straight away, wait 50ms then do it.
		setTimeout(function() { $("#add-torrent").blur(); }, "50");

		$("#add-torrent-dialog .close").click(function(e) {
			e.preventDefault();
			$("#add-torrent-dialog").hide()
		});

		var $inputBox = $("#manual_add_input")
			, $addButton = $("#manual_add_button");

		$inputBox.keydown(function (event) {
			if (event.keyCode === "13") {
				event.preventDefault();
				$addButton.click();
			}
		});

		$addButton.on("click", function (e) {
			e.preventDefault();
			var url = $inputBox.val();

			// Now check that the link contains either .torrent or download, get, etc...
			if (url.search(/\/(download|get)\//) > 0 || url.search(/\.torrent$/) > 0) {
				chrome.runtime.sendMessage({ msg: "add_torrent_from_url", url: url},
					function (response) {
						if (response.msg === "success") {
							$inputBox.val("");
						}
					});
			} else if (url.search(/magnet:/) != -1) {
				chrome.runtime.sendMessage({ msg: "add_torrent_from_magnet", url: url},
					function (response) {
						debug_log(response);
						if (response.msg === "success") {
							$inputBox.val("");
						}
					});
			}

			$("#add-torrent-dialog").hide();
		});
	}());

	$(function() {
		$("#sort").val(localStorage.sortColumn || "position");
		$("#sort_invert").attr("checked", (localStorage.sortMethod == "desc") );

		$("#filter_state").val(localStorage["filter_state"] || "All");
		$("#filter_tracker_host").val(localStorage["filter_tracker_host"] || "All");
		$("#filter_label").val(localStorage["filter_label"] || "All");

		$("#sort").on("change", function () {
			localStorage.sortColumn = $(this).val();
			renderTable();
		});

		$("#sort_invert").on("change", function () {
			localStorage.sortMethod = ($(this).is(":checked")) ? "desc" : "asc";
			renderTable();
		});

		$("#filter_state, #filter_tracker_host, #filter_label").on("change", function () {
			localStorage[$(this).attr("id")] = $(this).val();
			renderTable();
		});

		

	}());

	/*
	 * Check the status of the extension and do the handling for the popup.
	 *
	 * This function only displays error messages, it's the job of the
	 * background page to inform us the error has been resolved so we can update
	 * the table.
	 */
	function checkStatus() {
		backgroundPage.Background.checkStatus({ timeout: 1000 }).success(function (response) {
			if (response === false) {
				// Most likely still waiting on daemon to start.
				$("span", $overlay).removeClass().addClass("error").html(
					chrome.i18n.getMessage("error_daemon_not_running")
				);
				$overlay.show();
			}
		}).error(function (jqXHR, text, err) {
			var message = chrome.i18n.getMessage("error_generic");
			/*
			 * Ignore any unauthenticated errors here - they are normally
			 * resolved by an auto login in the background stuff and is normally
			 * sorted before this message can be fully displayed.
			 *
			 * We will instead receive errors from the global event for auto
			 * login failure to display the message to the user - see
			 * autoLoginFailed and Chrome extension addListner.
			 */
			if (err.code !== Deluge.API_AUTH_CODE) {
				$("span", $overlay).removeClass().addClass("error").html(message);
				$overlay.show();
			}
		});
	}

	// This function is called when the background page sends an activated
	// message, this happens roughly every minute so we only want to call
	// updateTable, or hide any current overlays once. We can let the local
	// timers within this script handle table updating.
	function activated() {
		if (!extensionActivated) {
			debug_log("Deluge: ACTIVATED");
			extensionActivated = true;
			$overlay.hide();
			updateTable();
		}
	}

	function deactivated() {
		extensionActivated = false;
	}

	function autoLoginFailed() {
		var message = chrome.i18n.getMessage("error_unauthenticated");
		$("span", $overlay).addClass("error").html(message);
		$overlay.show();
	}

	// Setup listeners for closing message overlays coming from background.
	chrome.runtime.onMessage.addListener(
		function (request, sender, sendResponse) {
			debug_log(request.msg);
			if (request.msg === "extension_activated") {
				activated();
			} else if (request.msg === "extension_deactivated") {
				deactivated();
			} else if (request.msg === "auto_login_failed") {
				autoLoginFailed();
			}
		}
	);

	// Do initial check.
	checkStatus();
});
