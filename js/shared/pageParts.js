// The parts of Messenger's pages Hide Me Chat works with, and the built-in ways to find each one, best first.
// Shared by the content scripts (which use them), the background (which checks rules from GitHub against them)
// and the popup (which names them in reports).
//
// Each way is a CSS selector for the part itself. The content scripts try a part's ways in order and use the
// first one that finds something; stylesheets use all of them. With layout fixes turned on in settings, rules
// from GitHub (rules/page-rules.json) add ways in front of these, or replace them.
const PAGE_PARTS = {
	// The element whose children are the chat rows, in the main list and in the Messenger dropdown.
	chatList: {
		label: "chat list",
		ways: ['[role="grid"] :has(> [data-virtualized])', "div[class='x1n2onr6']:has(a[href*='/t/'])"],
	},
	// What chat lists sit in, for stylesheets that must keep matching chat links as rows re-render.
	chatListArea: { label: "chat list area", ways: ['[role="grid"]', "div[class='x1n2onr6']"] },
	chatName: { label: "chat names", ways: ["span[dir='auto']"] },
	conversation: { label: "open chat", ways: ['[role="main"]', "div[class='x78zum5 xdt5ytf x1iyjqo2 xs83m0k x1n2onr6']"] },
	messageLog: { label: "messages", ways: ['[role="log"]'] },
	messageRow: { label: "message rows", ways: ["div[data-scope='messages_table']"] },
	messageText: { label: "message text", ways: ["div[dir='auto']"] },
	replyText: { label: "quoted replies", ways: ["div[class='xi81zsa x126k92a']"] },
	sticker: { label: "stickers", ways: ["div[role='img']"] },
	popupChat: { label: "chat pop-ups", ways: ["[data-mw-file-dropzone]"] },
	messageBox: { label: "message box", ways: ['[role="textbox"]'] },
};

// A part's status in words. Statuses are "main", "backup N" or "rule N" for the way that found it, "missing"
// for a part the page needs that wasn't found, and "none" for one that isn't on the page now.
function describeStatus(status) {
	if (status === "main") return "found by its main way";
	if (status === "missing") return "not found, and this page needs it";
	if (status === "none") return "not on the page now";
	const [kind, number] = String(status).split(" ");
	return kind === "rule" ? `found by GitHub rule ${number}` : `found by backup way ${number}`;
}

// ---------- rules from GitHub ----------

const PAGE_RULES_URL = "https://raw.githubusercontent.com/yvantot/HideMeChat/main/rules/page-rules.json";
const PAGE_RULES_MAX_LENGTH = 32768;
const PAGE_RULES_MAX_WAYS = 8;

// A rules file looks like:
//   { "format": 1, "version": "2026-10-22", "minVersion": "3.0.0", "maxVersion": "3.9.9",
//     "parts": { "messageRow": ["div[data-scope='message_row']"],
//                "messageText": { "ways": ["div[dir='auto'][class]"], "replace": true } } }
// A list of ways goes in front of the built-in ones; { ways, replace: true } is used instead of them. minVersion
// and maxVersion (optional) limit the rules to some versions of Hide Me Chat. Parts this version doesn't know
// are skipped, so newer rules don't break older versions.
//
// Returns { version, parts: { name: { ways, replace } }, skipped }, where skipped counts the ways left out for
// not being safe selectors, or throws an Error saying why the file can't be used.
function cleanPageRules(raw, extensionVersion) {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("The rules file isn't a rules file.");
	if (raw.format !== 1) throw new Error("The rules file is in a format this version doesn't know.");
	if (typeof raw.version !== "string" || !raw.version.trim() || raw.version.length > 40) {
		throw new Error("The rules file has no version.");
	}
	if (typeof raw.minVersion === "string" && compareVersions(extensionVersion, raw.minVersion) < 0) {
		throw new Error(`The rules are for version ${raw.minVersion} and newer.`);
	}
	if (typeof raw.maxVersion === "string" && compareVersions(extensionVersion, raw.maxVersion) > 0) {
		throw new Error(`The rules are for version ${raw.maxVersion} and older.`);
	}

	const parts = {};
	let skipped = 0;
	const given = raw.parts && typeof raw.parts === "object" && !Array.isArray(raw.parts) ? raw.parts : {};
	for (const [name, value] of Object.entries(given)) {
		if (!Object.hasOwn(PAGE_PARTS, name)) continue;
		const entry = Array.isArray(value) ? { ways: value } : value;
		if (!entry || !Array.isArray(entry.ways)) continue;
		const ways = entry.ways.slice(0, PAGE_RULES_MAX_WAYS).filter(isSafeSelector);
		skipped += Math.min(entry.ways.length, PAGE_RULES_MAX_WAYS) - ways.length;
		if (ways.length) parts[name] = { ways, replace: entry.replace === true };
	}
	return { version: raw.version.trim(), parts, skipped };
}

// Rules are data, never code: a way must be a plain selector, with nothing that could reach past it when it's put
// into a stylesheet (braces, semicolons, at-rules, escapes, comments, markup).
function isSafeSelector(selector) {
	return (
		typeof selector === "string" &&
		selector.trim().length > 0 &&
		selector.length <= 300 &&
		!/[{};@\\<\u0000-\u001f]|\/\*|\*\//.test(selector)
	);
}

// Compares "3.0.10" with "3.1": negative, zero or positive.
function compareVersions(a, b) {
	const left = String(a).split(".").map((n) => parseInt(n, 10) || 0);
	const right = String(b).split(".").map((n) => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const difference = (left[i] ?? 0) - (right[i] ?? 0);
		if (difference) return difference;
	}
	return 0;
}
