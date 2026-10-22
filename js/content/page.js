// Finds the parts of the page HideMeChat works with: the chat lists, the open conversation and the message logs
// of open chats (the conversation on messages pages, pop-ups elsewhere). Elements are found through ARIA roles
// and data attributes first; Meta's generated class names change often, so they're only a fallback.
const FALLBACK_SELECTORS = {
	CHATLIST: "div[class='x1n2onr6']",
	CONVERSATION: "div[class='x78zum5 xdt5ytf x1iyjqo2 xs83m0k x1n2onr6']",
};

const Page = {
	// "messenger" for messenger.com, "facebook-messages" for facebook.com/messages, "facebook" for any other
	// Facebook page, where chats only show up in the Messenger dropdown and in pop-ups.
	kind() {
		if (location.origin.includes("https://www.messenger.com")) return "messenger";
		if (location.href.includes("https://www.facebook.com/messages")) return "facebook-messages";
		return "facebook";
	},

	isMessagesPage() {
		return Page.kind() !== "facebook";
	},

	isFacebook() {
		return location.origin.includes("https://www.facebook.com");
	},

	// Chat links on facebook.com start with /messages; stored chat URLs don't.
	chatHref(chatUrl) {
		return `${Page.isFacebook() ? "/messages" : ""}${chatUrl}`;
	},

	// CSS selector for a chat's link in any chat list, for stylesheets that must keep matching as rows re-render.
	chatLinkSelector(chatUrl) {
		const link = `a[href='${Page.chatHref(chatUrl)}']`;
		return `[role="grid"] ${link}, ${FALLBACK_SELECTORS.CHATLIST} ${link}`;
	},

	// Every chat list on the page (the main one and the Messenger dropdown): the elements whose children are
	// the chat rows. The main list comes first.
	chatLists() {
		const grids = [...document.querySelectorAll('[role="grid"]')].sort(
			(a, b) => !!a.closest('[role="dialog"]') - !!b.closest('[role="dialog"]')
		);
		const lists = grids.map((grid) => grid.querySelector("[data-virtualized]")?.parentElement).filter(Boolean);
		if (lists.length) return lists;
		return [...document.querySelectorAll(FALLBACK_SELECTORS.CHATLIST)].filter((el) =>
			el.querySelector("a[href*='/t/']")
		);
	},

	chatList() {
		return Page.chatLists()[0] ?? null;
	},

	findChatLink(chatUrl) {
		for (const list of Page.chatLists()) {
			const link = list.querySelector(`a[href='${Page.chatHref(chatUrl)}']`);
			if (link) return link;
		}
		return null;
	},

	// The area showing the open chat on messages pages. The lock screen covers it.
	conversation() {
		return Page.locate.conversation().element;
	},

	// Every open chat: its message log, the `area` around it (the conversation on messages pages, the chat
	// window for pop-ups), and what identifies the chat: `chatUrl` for the conversation (from the page URL),
	// `title` for pop-ups (their header shows the chat's name).
	openChats() {
		const conversation = Page.conversation();
		return [...document.querySelectorAll('[role="log"]')].map((log) =>
			conversation?.contains(log)
				? { log, area: conversation, chatUrl: getCurrentChat(), title: null }
				: { log, area: chatWindow(log), chatUrl: null, title: popupTitle(log) }
		);
	},

	// The parts of an open chat's area that give it away outside its messages: { media, text }.
	//   - Each visible name heading (the chat's header, the info panel) sits in a block with the chat's avatar;
	//     the avatar is media, and the block's other parts with text are text, unless they hold controls
	//     (Profile, Mute, …).
	//   - The pinned-message banner: a button with text but no avatar, between the header and the log, in the
	//     column that holds both (the info panel is outside it).
	identityParts(area, log) {
		const parts = { media: [], text: [] };
		// Avatars are <img>, or <svg> with an <image> inside.
		const avatars = (block) => [...block.querySelectorAll("img, svg")].filter((el) => el.tagName === "IMG" || el.querySelector("image"));
		let column = null;
		for (const heading of area.querySelectorAll("h1, h2, h3")) {
			if (log.contains(heading)) continue;
			let block = heading.parentElement;
			while (block && block !== area && avatars(block).length === 0) block = block.parentElement;
			// Visually hidden headings share a block with the whole log or the message box; skip those.
			if (!block || block === area || block.contains(log) || block.querySelector('[role="textbox"]')) continue;

			parts.media.push(...avatars(block));
			for (const child of block.children) {
				if (!child.textContent.trim()) continue;
				const buttons = [...child.querySelectorAll('[role="button"]')];
				if (child.matches('[role="button"]')) buttons.push(child);
				if (buttons.some((button) => !button.contains(heading))) continue;
				parts.text.push(child);
			}

			const shared = commonAncestor(heading, log);
			if (shared && (!column || column.contains(shared))) column = shared;
		}

		if (column) {
			const composer = area.querySelector('[role="textbox"]');
			for (const button of column.querySelectorAll('[role="button"]')) {
				if (log.contains(button) || button.contains(log) || (composer && button.contains(composer))) continue;
				if (!button.textContent.trim() || avatars(button).length) continue;
				if (parts.text.some((part) => part.contains(button) || button.contains(part))) continue;
				parts.text.push(button);
			}
		}
		return parts;
	},

	// Each locator returns { element, via }: via is "anchor", "fallback", or null when nothing was found.
	locate: {
		chatList() {
			const list = Page.chatList();
			if (!list) return found(null);
			return found(list, list.closest('[role="grid"]') ? "anchor" : "fallback");
		},

		conversation() {
			if (!Page.isMessagesPage()) return found(null);
			const main = document.querySelector('[role="main"]');
			if (main?.querySelector('[role="log"]')) return found(main, "anchor");
			return found(document.querySelector(FALLBACK_SELECTORS.CONVERSATION), "fallback");
		},

		messages() {
			const log = Page.conversation()?.querySelector('[role="log"]');
			return found(log?.querySelector(SELECTORS.MESSAGEROW) ? log : null, "anchor");
		},
	},

	// Reports which parts were found and how, and whether everything this page needs is there.
	health() {
		const chatOpen = /\/t\/\d+/.test(location.pathname);
		const parts = {};
		for (const [name, locate] of Object.entries(Page.locate)) parts[name] = locate().via ?? "missing";

		const required = [];
		if (Page.isMessagesPage()) required.push("chatList");
		if (Page.isMessagesPage() && chatOpen) required.push("conversation", "messages");
		const missing = required.filter((name) => parts[name] === "missing");

		return { kind: Page.kind(), chatOpen, parts, missing, ok: missing.length === 0 };
	},
};

function found(element, via) {
	return element ? { element, via } : { element: null, via: null };
}

// A pop-up's title is the first heading in its chat window: the element holding the header and the message
// area (data-mw-file-dropzone). The message area has hidden headings of its own, so searching outward from
// the log would find those first.
function popupTitle(log) {
	const heading = chatWindow(log)?.querySelector('h2, [role="heading"]');
	return heading ? heading.textContent.trim() : null;
}

function commonAncestor(a, b) {
	for (let el = a; el; el = el.parentElement) {
		if (el.contains(b)) return el;
	}
	return null;
}

function chatWindow(log) {
	return log.closest("[data-mw-file-dropzone]")?.parentElement ?? null;
}
