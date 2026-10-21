// Captures a sanitized snapshot of a Messenger / Facebook page for tests/fixtures. Paste it into the DevTools
// console on facebook.com/messages, messenger.com or a Facebook page with the Messenger dropdown or a chat pop-up
// open; it copies the HTML to the clipboard (and returns it).
//
// Only what page.js relies on is kept: the chat lists, the conversation area and chat pop-ups, with their roles,
// dir / aria-hidden / data-* attributes and Meta's fallback class names. Everything personal is replaced:
//   - all text becomes "Text 1", "Text 2", … (the same text gets the same placeholder, so a chat's name in the list
//     still matches its pop-up title), except "·" and short times like "3h";
//   - chat ids become 1001, 1002, …; other links become "#"; images and labels are dropped.
// Only the first few chats and messages are kept to keep fixtures small.
(() => {
	const KEEP_ATTRIBUTES = ["role", "dir", "aria-hidden", "data-virtualized", "data-scope", "data-mw-file-dropzone"];
	const FALLBACK_CLASSES = new Set([
		"x1n2onr6",
		"x78zum5 xdt5ytf x1iyjqo2 xs83m0k x1n2onr6",
		"x78zum5 xdt5ytf x1iyjqo2 x2lah0s xl56j7k x121v3j4",
		"xi81zsa x126k92a",
	]);
	const MAX_CHATS = 4;
	const MAX_MESSAGES = 5;
	const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "LINK", "META", "IFRAME"]);

	const texts = new Map();
	const ids = new Map();
	const fakeText = (text) => {
		const trimmed = text.trim();
		if (!trimmed || trimmed === "·" || /^\d{1,2}[smhdwy]$/.test(trimmed)) return text;
		if (!texts.has(trimmed)) texts.set(trimmed, `Text ${texts.size + 1}`);
		return texts.get(trimmed);
	};
	const fakeHref = (href) => {
		const match = href.match(/^(\/messages)?(\/e2ee)?\/t\/(\d+)\/?$/);
		if (!match) return "#";
		if (!ids.has(match[3])) ids.set(match[3], String(1001 + ids.size));
		return `${match[1] ?? ""}${match[2] ?? ""}/t/${ids.get(match[3])}/`;
	};
	const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

	// The parts to keep whole; their ancestors are kept as a bare path. On other Facebook pages, role="main" is the
	// news feed, so only the Messenger dropdown and pop-ups are kept.
	const messagesPage = location.pathname.startsWith("/messages") || location.origin.includes("messenger.com");
	const roots = [
		...document.querySelectorAll(messagesPage ? '[role="grid"], [role="main"]' : '[role="grid"]'),
		...[...document.querySelectorAll("[data-mw-file-dropzone]")].map((zone) => zone.parentElement),
	].filter((el, i, all) => el && !all.some((other, j) => j !== i && other && other !== el && other.contains(el)));
	const onPath = (el) => roots.some((root) => el.contains(root));
	const inRoot = (el) => roots.some((root) => root.contains(el));

	function attributes(el) {
		let out = "";
		for (const name of KEEP_ATTRIBUTES) {
			if (!el.hasAttribute(name)) continue;
			const value = name === "data-mw-file-dropzone" ? "1" : el.getAttribute(name);
			out += ` ${name}="${escape(value)}"`;
		}
		const cls = el.getAttribute("class");
		if (cls && FALLBACK_CLASSES.has(cls)) out += ` class="${cls}"`;
		if (el.tagName === "A" && el.hasAttribute("href")) out += ` href="${fakeHref(el.getAttribute("href"))}"`;
		if (el.tagName === "IMG") out += ` src="img.png"`;
		return out;
	}

	function keepChild(el) {
		if (el.hasAttribute("data-virtualized")) {
			const rows = [...el.parentElement.children].filter((c) => c.hasAttribute("data-virtualized"));
			return rows.indexOf(el) < MAX_CHATS;
		}
		if (el.getAttribute("data-scope") === "messages_table") {
			const log = el.closest('[role="log"]');
			const rows = log ? [...log.querySelectorAll('[data-scope="messages_table"]')] : [];
			return rows.indexOf(el) < MAX_MESSAGES;
		}
		return true;
	}

	function serialize(node, whole) {
		if (node.nodeType === Node.TEXT_NODE) return whole ? escape(fakeText(node.data)) : "";
		if (node.nodeType !== Node.ELEMENT_NODE || SKIP_TAGS.has(node.tagName)) return "";
		const tag = node.tagName.toLowerCase();
		if (tag === "svg") return "<svg></svg>";
		const isWhole = whole || inRoot(node);
		if (!isWhole && !onPath(node)) return "";
		if (isWhole && !keepChild(node)) return "";
		const open = `<${tag}${attributes(node)}>`;
		if (["img", "input", "br", "hr"].includes(tag)) return open;
		return `${open}${[...node.childNodes].map((child) => serialize(child, isWhole)).join("")}</${tag}>`;
	}

	const html = `<!-- ${location.origin}${location.pathname.replace(/\d+/g, "N")} -->\n${serialize(document.body, false)}\n`;
	if (typeof copy === "function") copy(html);
	return html;
})();
