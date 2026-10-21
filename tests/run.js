// Runs every tests/*.test.js file. No dependencies: `node tests/run.js` (Node 20 or newer).
// Each test file exports an async function that receives `check(name, ok, detail)`.
const fs = require("fs");
const path = require("path");

let running = null;
// A test waiting on something that never happens leaves Node with nothing to do, and it would exit silently.
process.on("exit", (code) => {
	if (running) {
		console.log(`\n${running} got stuck waiting (a promise that never settled, e.g. a fake timer nobody advanced).`);
		process.exitCode = 1;
	}
});

(async () => {
	const files = fs.readdirSync(__dirname).filter((file) => file.endsWith(".test.js")).sort();
	const only = process.argv[2];
	let passed = 0;
	const failures = [];

	for (const file of files) {
		if (only && !file.includes(only)) continue;
		running = file;
		let filePassed = 0;
		const check = (name, ok, detail = "") => {
			if (ok) {
				passed++;
				filePassed++;
			} else {
				failures.push(`${file}: ${name}${detail !== "" ? ` -> ${detail}` : ""}`);
			}
		};
		try {
			await require(path.join(__dirname, file))(check);
		} catch (error) {
			failures.push(`${file}: crashed -> ${error.stack}`);
		}
		console.log(`${file.padEnd(22)} ${filePassed} passed`);
	}
	running = null;

	console.log(`\n${passed} passed, ${failures.length} failed`);
	failures.forEach((failure) => console.log(`  FAIL ${failure}`));
	process.exit(failures.length ? 1 : 0);
})();
