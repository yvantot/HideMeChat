// What Hide Me Chat noticed on this page since it loaded, for the report people can copy from the popup: parts
// that went missing or are found by a backup way, the layout rules in use, and errors. It stays in this tab's
// memory, and nothing about chats goes in it: no names, messages or links.
const HEALTH_LOG_SIZE = 40;
const healthLog = [];
const pageLoadedAt = Date.now();

// Adds a line to the log: { kind: "part" | "rules" | "error", text, first, last, count }. An error that's already
// there is counted again instead of repeated, since it usually happens on every page change.
function logEvent(kind, text) {
	const now = Date.now();
	const known = kind === "error" && healthLog.find((entry) => entry.kind === kind && entry.text === text);
	if (known) {
		known.count++;
		known.last = now;
		return;
	}
	healthLog.push({ kind, text, first: now, last: now, count: 1 });
	if (healthLog.length > HEALTH_LOG_SIZE) healthLog.shift();
}

// Logs an error from Hide Me Chat's own code: its kind, message and file, with long numbers (chat ids) cut out.
function logError(where, error) {
	const file = String(error?.stack ?? "").match(/js\/[\w/]+\.js:\d+/)?.[0];
	const text = `${where}: ${error?.name ?? "Error"}: ${error?.message ?? error}${file ? ` (${file})` : ""}`;
	logEvent("error", text.replace(/\d{5,}/g, "…").slice(0, 300));
}

// Wraps `fn` so an error in it is logged (and shown in the console) instead of stopping later page updates.
function guarded(where, fn) {
	return (...args) => {
		try {
			return fn(...args);
		} catch (error) {
			logError(where, error);
			console.error("Hide Me Chat:", error);
		}
	};
}

// ---------- parts over time ----------

let healthTimer = null;
// Each part's status as last logged, and a new status seen once that waits for a second look.
const loggedStatus = {};
const pendingStatus = {};

// Looks at the page's parts a few seconds after it changes (at most that often), so the log shows when a part
// went missing or started to be found another way.
function watchHealth() {
	if (healthTimer !== null) return;
	healthTimer = setTimeout(
		guarded("health check", () => {
			healthTimer = null;
			noteHealth(Page.health().parts);
		}),
		4000
	);
}

// Logs each part whose status changed and stayed changed for two looks: parts come and go while Messenger
// renders. Parts that simply aren't on the page now ("none") are left out.
function noteHealth(statuses) {
	for (const [name, status] of Object.entries(statuses)) {
		if (status === "none") continue;
		if (status === (loggedStatus[name] ?? "main")) {
			delete pendingStatus[name];
		} else if (pendingStatus[name] !== status) {
			pendingStatus[name] = status;
		} else {
			loggedStatus[name] = status;
			delete pendingStatus[name];
			logEvent("part", `${PAGE_PARTS[name].label}: ${describeStatus(status)}`);
		}
	}
}
