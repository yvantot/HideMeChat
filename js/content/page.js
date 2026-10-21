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

	// The message logs of every open chat, each with what identifies its chat: `chatUrl` for the conversation
	// on messages pages (from the page URL), `title` for pop-ups (their header shows the chat's name).
	openChats() {
		const conversation = Page.conversation();
		return [...document.querySelectorAll('[role="log"]')].map((log) =>
			conversation?.contains(log)
				? { log, chatUrl: getCurrentChat(), title: null }
				: { log, chatUrl: null, title: popupTitle(log) }
		);
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
	const chatWindow = log.closest("[data-mw-file-dropzone]")?.parentElement;
	if (!chatWindow) return null;
	const heading = chatWindow.querySelector('h2, [role="heading"]');
	return heading ? heading.textContent.trim() : null;
}
