// Finds the parts of the page HideMeChat works with: the chat list, the open conversation with its message list
// and info panel, and chat pop-ups. Elements are found through ARIA roles and data attributes first; Meta's
// generated class names change often, so they're only a fallback.
const FALLBACK_SELECTORS = {
	CHATLIST: "div[class='x1n2onr6']",
	CONVERSATION: "div[class='x78zum5 xdt5ytf x1iyjqo2 xs83m0k x1n2onr6']",
	MESSAGELIST: "div[class='x78zum5 xdt5ytf x1iyjqo2 x2lah0s xl56j7k x121v3j4']",
	INFOPANEL: "div[class='x78zum5 x5yr21d xmz0i5r']",
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

	// CSS selector for a chat's link in the chat list, for stylesheets that must keep matching as rows re-render.
	chatLinkSelector(chatUrl) {
		const link = `a[href='${Page.chatHref(chatUrl)}']`;
		return `[role="grid"] ${link}, ${FALLBACK_SELECTORS.CHATLIST} ${link}`;
	},

	// The element whose children are the chat rows.
	chatList() {
		return Page.locate.chatList().element;
	},

	findChatLink(chatUrl) {
		return Page.chatList()?.querySelector(`a[href='${Page.chatHref(chatUrl)}']`) ?? null;
	},

	// The area showing the open chat, on messages pages. The lock screen covers it.
	conversation() {
		return Page.locate.conversation().element;
	},

	// The element whose children are the open chat's messages.
	messageList() {
		return Page.locate.messageList().element;
	},

	// The message lists of every chat on the page: the open chat on messages pages, pop-ups elsewhere.
	messageLists() {
		return [...document.querySelectorAll('[role="log"]')].map((log) => messageListIn(log).element).filter(Boolean);
	},

	// The chat info panel beside the open chat, if it's showing.
	infoPanel() {
		return Page.locate.infoPanel().element;
	},

	// Each locator returns { element, via }: via is "anchor", "fallback", or null when nothing was found.
	locate: {
		chatList() {
			// Prefer the main chat list over the Messenger dropdown when both are on the page.
			const grids = [...document.querySelectorAll('[role="grid"]')].sort(
				(a, b) => !!a.closest('[role="dialog"]') - !!b.closest('[role="dialog"]')
			);
			for (const grid of grids) {
				const list = grid.querySelector("[data-virtualized]")?.parentElement;
				if (list) return found(list, "anchor");
			}
			const fallback = [...document.querySelectorAll(FALLBACK_SELECTORS.CHATLIST)].find((el) =>
				el.querySelector("a[href*='/t/']")
			);
			return found(fallback, "fallback");
		},

		conversation() {
			if (!Page.isMessagesPage()) return found(null);
			const main = document.querySelector('[role="main"]');
			if (main?.querySelector('[role="log"]')) return found(main, "anchor");
			return found(document.querySelector(FALLBACK_SELECTORS.CONVERSATION), "fallback");
		},

		messageList() {
			const log = Page.conversation()?.querySelector('[role="log"]');
			if (log) return messageListIn(log);
			if (!Page.isMessagesPage()) return found(null);
			return found(document.querySelector(FALLBACK_SELECTORS.MESSAGELIST), "fallback");
		},

		// The info panel has no landmark of its own: it's the large block beside the message log.
		infoPanel() {
			const conversation = Page.conversation();
			const log = conversation?.querySelector('[role="log"]');
			if (log) {
				const logBox = log.getBoundingClientRect();
				for (let el = log; el !== conversation && el.parentElement; el = el.parentElement) {
					for (const sibling of el.parentElement.children) {
						if (sibling === el) continue;
						const box = sibling.getBoundingClientRect();
						const beside = box.left >= logBox.right - 1 || box.right <= logBox.left + 1;
						if (beside && box.width > 150 && box.height > 150) return found(sibling, "anchor");
					}
				}
			}
			if (!Page.isMessagesPage()) return found(null);
			return found(document.querySelector(FALLBACK_SELECTORS.INFOPANEL), "fallback");
		},
	},

	// Reports which parts were found and how, and whether everything this page needs is there.
	health() {
		const chatOpen = /\/t\/\d+/.test(location.pathname);
		const parts = {};
		for (const [name, locate] of Object.entries(Page.locate)) parts[name] = locate().via ?? "missing";

		const required = [];
		if (Page.isMessagesPage()) required.push("chatList");
		if (Page.isMessagesPage() && chatOpen) required.push("conversation", "messageList");
		const missing = required.filter((name) => parts[name] === "missing");

		return { kind: Page.kind(), chatOpen, parts, missing, ok: missing.length === 0 };
	},
};

function found(element, via) {
	return element ? { element, via } : { element: null, via: null };
}

// The message list is the closest element holding every message row in the chat's log.
function messageListIn(log) {
	const rows = log.querySelectorAll(SELECTORS.MESSAGEROW);
	if (rows.length >= 2) {
		const last = rows[rows.length - 1];
		for (let el = rows[0].parentElement; el && log.contains(el); el = el.parentElement) {
			if (el.contains(last)) return found(el, "anchor");
		}
	}
	const fallback = log.querySelector(FALLBACK_SELECTORS.MESSAGELIST);
	if (fallback) return found(fallback, "fallback");
	return found(rows.length ? log : null, "anchor");
}
