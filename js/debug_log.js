function debug_log(msg) {
	if (ExtensionConfig.debug_mode) {
		console.log(...arguments);
	}
}