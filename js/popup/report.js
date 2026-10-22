// The report people can copy when Hide Me Chat doesn't work right on a page: what it sees on the active tab, the
// layout rules in use and what it noticed since the page loaded. It never holds names, messages or links. Also
// layout fixes, which the report, the page warning and settings share.
const PAGE_KINDS = {
	messenger: "messenger.com",
	"facebook-messages": "facebook.com/messages",
	facebook: "facebook.com, outside Messages",
};

async function buildReport() {
	const health = await askActiveTab({ message: "health" });
	const { pageRules, rulesCheck } = await storage.get(DEVICE_KEYS);
	const { preferences } = await loadData();
	const lines = [
		`Hide Me Chat ${chrome.runtime.getManifest().version}, ${browserName()}`,
		`Layout fixes: ${layoutFixesText(preferences, pageRules, rulesCheck)}`,
		"",
	];
	if (!health) {
		lines.push("No Messenger page with Hide Me Chat running in this tab. Pages opened before it was installed or updated need a reload.");
		return lines.join("\n");
	}

	lines.push(`Page: ${PAGE_KINDS[health.kind] ?? health.kind}${health.chatOpen ? ", with a chat open" : ""}`);
	lines.push(`Layout rules on the page: ${health.rules ? `${health.rules} from GitHub` : "built-in"}`);
	lines.push("Parts:");
	for (const [name, status] of Object.entries(health.parts ?? {})) {
		lines.push(`  ${PAGE_PARTS[name]?.label ?? name}: ${describeStatus(status)}`);
	}
	const log = health.log ?? [];
	const loaded = clockTime(health.loadedAt);
	lines.push("", log.length ? `Since the page loaded at ${loaded}:` : `Nothing to note since the page loaded at ${loaded}.`);
	for (const entry of log) {
		const when = entry.count > 1 ? `${clockTime(entry.first)} (${entry.count} times, last at ${clockTime(entry.last)})` : clockTime(entry.first);
		lines.push(`  ${when} ${entry.kind === "error" ? "Error in " : ""}${entry.text}`);
	}
	return lines.join("\n");
}

async function copyReport() {
	const text = await buildReport();
	try {
		await navigator.clipboard.writeText(text);
		showToast("Report copied");
	} catch {
		showToast("Couldn't copy the report");
	}
}

// "Chrome 141, Windows": enough to tell browser problems apart, no more.
function browserName() {
	const agent = navigator.userAgent;
	const version = (name) => agent.match(new RegExp(`${name}/(\\d+)`))?.[1];
	const browser = version("Edg") ? `Edge ${version("Edg")}` : version("Chrome") ? `Chrome ${version("Chrome")}` : "Unknown browser";
	const systems = [["Windows", "Windows"], ["Android", "Android"], ["CrOS", "ChromeOS"], ["Mac OS X", "macOS"], ["Linux", "Linux"]];
	const system = systems.find(([key]) => agent.includes(key))?.[1];
	return system ? `${browser}, ${system}` : browser;
}

function clockTime(ms) {
	return new Date(ms).toTimeString().slice(0, 8);
}

function whenText(ms) {
	const date = new Date(ms);
	const time = date.toTimeString().slice(0, 5);
	if (date.toDateString() === new Date().toDateString()) return `today at ${time}`;
	return `on ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at ${time}`;
}

// ---------- layout fixes ----------

// Layout fixes in a sentence or two.
function layoutFixesText(preferences, pageRules, rulesCheck) {
	if (!preferences.layoutFixes) return "Off. Hide Me Chat doesn't connect to anything.";
	if (!rulesCheck) return "On. Not checked yet.";
	const hasFixes = Object.keys(pageRules?.parts ?? {}).length > 0;
	const fixes = hasFixes ? `Using fixes from ${pageRules.version}.` : "No fixes needed so far.";
	if (!rulesCheck.ok) return `On. The check ${whenText(rulesCheck.at)} failed: ${rulesCheck.error}${hasFixes ? ` ${fixes}` : ""}`;
	return `On. ${fixes} Checked ${whenText(rulesCheck.at)}.`;
}

// Turning layout fixes off also forgets the rules, so the pages go back to the built-in ways.
async function setLayoutFixes(on) {
	const data = await loadData();
	data.preferences.layoutFixes = on;
	await storage.set(data);
	if (!on) await storage.remove(DEVICE_KEYS);
}

// Asks the background to check GitHub now. Resolves with { ok: true, version, changed } or { ok: false, error }.
function requestPageRules() {
	return new Promise((resolve) => {
		chrome.runtime.sendMessage({ message: "pageRulesFetch" }, (result) => {
			resolve(chrome.runtime.lastError || !result ? { ok: false, error: "Something went wrong. Try again." } : result);
		});
	});
}
