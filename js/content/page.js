// Finds the parts of the page HideMeChat works with: the chat lists, the open conversation and the message logs
// of open chats (the conversation on messages pages, pop-ups elsewhere). Each part has a few ways to find it
// (Parts, from shared/pageParts.js): ARIA roles and data attributes first; Meta's generated class names change
// often, so they're only a backup.
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

	// CSS selectors for a chat's link in any chat list, one for each way of finding the area around chat lists, for
	// stylesheets that must keep matching as rows re-render.
	chatLinkSelectors(chatUrl) {
		const link = `a[href='${Page.chatHref(chatUrl)}']`;
		return Parts.selectors("chatListArea").map((area) => `${area} ${link}`);
	},

	// Every chat list on the page (the main one and the Messenger dropdown): the elements whose children are
	// the chat rows. The main list comes first.
	chatLists() {
		return Page.locate.chatList().elements.sort((a, b) => !!a.closest('[role="dialog"]') - !!b.closest('[role="dialog"]'));
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

	// The area showing the open chat on messages pages.
	conversation() {
		return Page.locate.conversation().element;
	},

	// Every open chat: its message log, the `area` around it (the conversation on messages pages, the chat
	// window for pop-ups), and what identifies the chat: `chatUrl` for the conversation (from the page URL),
	// `title` for pop-ups (their header shows the chat's name).
	openChats() {
		const conversation = Page.conversation();
		return Parts.all("messageLog").map((log) =>
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
			if (!block || block === area || block.contains(log) || Parts.first("messageBox", block)) continue;

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
			const composer = Parts.first("messageBox", area);
			for (const button of column.querySelectorAll('[role="button"]')) {
				if (log.contains(button) || button.contains(log) || (composer && button.contains(composer))) continue;
				if (!button.textContent.trim() || avatars(button).length) continue;
				if (parts.text.some((part) => part.contains(button) || button.contains(part))) continue;
				parts.text.push(button);
			}
		}
		return parts;
	},

	// Locators for the parts that need more than a selector. Each returns what it found and the way that found it.
	locate: {
		// { elements, way }
		chatList() {
			return Parts.find("chatList");
		},

		// { element, way }: the first element found by the conversation's ways that holds a message log, or the
		// first one found while the chat is still loading. The lock screen covers it.
		conversation() {
			if (!Page.isMessagesPage()) return { element: null, way: null };
			let loading = null;
			for (const way of Parts.ways.conversation) {
				for (const element of document.querySelectorAll(way.selector)) {
					if (Parts.first("messageLog", element)) return { element, way };
					loading ??= { element, way };
				}
			}
			return loading ?? { element: null, way: null };
		},
	},

	// Reports how each part was found (see describeStatus), and whether everything this page needs is there.
	// Parts are looked for where they belong: message rows in the open chat's log, chat names in a chat list.
	health() {
		const chatOpen = /\/t\/\d+/.test(location.pathname);
		const required = [];
		if (Page.isMessagesPage()) required.push("chatList");
		if (Page.isMessagesPage() && chatOpen) required.push("conversation", "messageLog", "messageRow");

		const lists = Page.locate.chatList();
		const conversation = Page.locate.conversation();
		const logs = Parts.find("messageLog", conversation.element ?? document);
		const log = logs.elements[0];
		const found = { chatList: lists.way, conversation: conversation.way, messageLog: logs.way };
		const within = {
			chatName: lists.elements[0],
			messageRow: log,
			messageText: log,
			replyText: log,
			sticker: log,
			messageBox: conversation.element,
		};

		const parts = {};
		for (const name of Object.keys(PAGE_PARTS)) {
			const way = name in found ? found[name] : Parts.find(name, within[name] ?? document).way;
			parts[name] = way ? Parts.status(way) : required.includes(name) ? "missing" : "none";
		}
		const missing = required.filter((name) => parts[name] === "missing");
		return { kind: Page.kind(), chatOpen, parts, missing, ok: missing.length === 0 };
	},
};

// A pop-up's title is the first heading in its chat window: the element holding the header and the message
// area (the popupChat part). The message area has hidden headings of its own, so searching outward from
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
	return Parts.closest(log, "popupChat")?.parentElement ?? null;
}
