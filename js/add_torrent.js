$("body").on("click", "a", function(event) {
	if (options.handle_magnets) {
		if ($(this).attr("href").indexOf("magnet:") == 0) {
			event.stopPropagation();
			event.preventDefault();
			if (options.debug_mode){
				console.log("Captured magnet link "+$(this).attr("href"));
			}
			chrome.extension.sendMessage(
				{
					method: "add_torrent_from_magnet",
					url: $(this).attr("href")
				},
				function (response) {
					console.log(response);
					if (response.msg === "success") {
						if (options.debug_mode) {
							console.log("Success adding magnet "+$(this).attr("href"));
						}
						//TODO: show a badge on the browser button IAW options specified
					}
				}
			);
		}
	}
});
$("body").on("click", "a", function(event) {
	if (options.handle_torrents) {
		if ($(this).attr("href").indexOf(".torrent") > -1) {
			event.stopPropagation();
			event.preventDefault();
			if (options.debug_mode) {
				console.log("Captured .torrent link "+$(this).attr("href"))
			}
			chrome.extension.sendMessage(
				{
					method: "add_torrent_from_url",
					url: this.href
				},
				function (response) {
					console.log(response);
					if (response.msg === "success") {
						if (options.debug_mode) {
							console.log("Success adding torrent "+$(this).attr("href"));
						}
						//TODO: show a badge on the browser button IAW options specified
					}
				}
			);
		}
	}
});
