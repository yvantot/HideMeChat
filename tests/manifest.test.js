// manifest.json: every file it names is in the package, by the exact path the Chrome Web Store looks for. Chrome
// itself accepts "./assets/...", but the store's upload check doesn't, and rejects the package.
const fs = require("fs");
const path = require("path");
const { ROOT, manifest } = require("./support/helpers");

// Width and height from a PNG's header.
function pngSize(file) {
	const header = fs.readFileSync(file).subarray(0, 24);
	return [header.readUInt32BE(16), header.readUInt32BE(20)];
}

module.exports = async (check) => {
	const paths = [
		...Object.values(manifest.icons),
		...Object.values(manifest.action.default_icon),
		manifest.action.default_popup,
		manifest.background.service_worker,
		...manifest.content_scripts.flatMap((script) => script.js),
		...manifest.web_accessible_resources.flatMap((entry) => entry.resources),
	];
	const prefixed = paths.filter((p) => /^\.?\//.test(p));
	check("paths are plain, without ./ or /", prefixed.length === 0, prefixed.join(", "));
	const missing = paths.filter((p) => !fs.existsSync(path.join(ROOT, p)));
	check("every file the manifest names exists", missing.length === 0, missing.join(", "));
	const wrongSize = Object.entries(manifest.icons).filter(([size, file]) => pngSize(path.join(ROOT, file)).join() !== `${size},${size}`);
	check("icons are the size they're listed as", wrongSize.length === 0, JSON.stringify(wrongSize));
};
