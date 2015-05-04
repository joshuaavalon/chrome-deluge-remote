/*
 * Module responsible for fetching, storing and sorting torrent objects.
 */
var Torrents = (function ($) {
	var pub = {}
		// Stores all torrent data, using array so it can be sorted.
		, torrents = []
		, globalInformation = {};

	function sortCallback(a, b) {
		switch (localStorage.sortColumn) {
			case 'name':
				a = a.name;
				b = b.name;
				break;

			case 'size':
				a = a.size;
				b = b.size;
				break;

			case 'progress':
				a = a.progress;
				b = b.progress;
				break;

			case 'speed':
				a = a.speed;
				b = b.speed;
				break;

			case 'eta':
				a = a.eta;
				b = b.eta;
				break;

			case 'position':
				a = (a.position == -1) ? 999 : a.position;
				b = (b.position == -1) ? 999 : b.position;
				break;

			// Sort by queue asc if nothing is already set.
			default:
				a = a.position;
				b = b.position;
				// Set them for future use.
				localStorage.sortColumn = 'position';
				localStorage.sortMethod = 'asc';
				break;
		}

		if (a < b) {
			return -1;
		}
		if (a > b) {
			return 1;
		}

		return 0;
	}

	pub.getAll = function () {
		return torrents;
	};

	pub.getById = function (val) {
		var i;
		for (i = 0; i < torrents.length; i += 1) {
			if (torrents[i].id === val) {
				return torrents[i];
			}
		}
		return false;
	};

	pub.getGlobalInformation = function () {
		return globalInformation;
	};

	pub.cleanup = function () {
		var i;
		for (i = 0; i < torrents.length; i += 1) {
			torrents[i] = null;
		}
		torrents = null;
	};

	pub.update = function () {
		var that = this;
		var api = Deluge.api('web.update_ui', [[
				"queue",
				"name",
				"total_size",
				"state",
				"progress",
				"download_payload_rate",
				"upload_payload_rate",
				"eta",
				"ratio",
				"is_auto_managed",
				"num_seeds",
				"total_seeds",
				"num_peers",
				"total_peers",
				"seeds_peers_ratio",
				"is_finished",
				"is_seed",
				"active_time",
				"seeding_time",
				"time_added",
				"tracker_host",
				"tracker_status",
				"label"
			],
				{}
			],
				{ timeout: 2000 }
			)
			.success(function (response) {
				var id, tmp;
				// Reset torrents array.
				that.cleanup();
				torrents = [];
				for (id in response.torrents) {
					if (response.torrents.hasOwnProperty(id)) {
						torrents.push(new Torrent(id, response.torrents[id]));
					}
				}

				for (id in response.filters.state) {
					if (response.filters.state.hasOwnProperty(id)) {
						tmp = response.filters.state[id];
						globalInformation[tmp[0].toLowerCase()] = tmp[1];
					}
				}

				for (id in response.filters) {
					if (response.filters.hasOwnProperty(id)) {
						$("#filter_"+id).empty();
						for (var i = 0; i < response.filters[id].length; i++) {

							var text = response.filters[id][i][0];
							text = (text == "" ? "<blank>" : text);
							text += " (" + response.filters[id][i][1] + ")";

							$("#filter_"+id).append($('<option>', {
								value: response.filters[id][i][0],
								text: text
							}));

						}
						$("#filter_"+id).val(localStorage["filter_"+id] || "All");
					}
				}

				response = null;

				// Sort the torrents.
				torrents.sort(sortCallback);
				if (localStorage.sortMethod === 'desc') {
					torrents.reverse();
				}
				if (localStorage.debugMode.toBoolean()) {
					console.log(torrents);
				}
			});

		return api;
	};

	return pub;
}(jQuery));
