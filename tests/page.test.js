// js/content/page.js: page detection and finding the page's parts, on synthetic pages and on sanitized live captures.
const { read, CLASSES, contentWorld, messagesPage, facebookHome, chatHref, stored, chat } = require("./support/helpers");

// How the parts a messages page with an open chat needs were found.
const core = (health) => ["chatList", "conversation", "messageLog", "messageRow"].map((name) => health.parts[name]).join();
const allMain = (health) => Object.values(health.parts).every((status) => status === "main" || status === "none");

const fixture = (name) => read(`tests/fixtures/${name}.html`).replace(/^[\s\S]*?<body>/, "").replace(/<\/body>[\s\S]*$/, "");

module.exports = async (check) => {
	// ---------- kind and helpers ----------
	for (const [url, kind, prefix] of [
		["https://www.messenger.com/t/1", "messenger", ""],
		["https://www.messenger.com/", "messenger", ""],
		["https://www.facebook.com/messages/e2ee/t/5", "facebook-messages", "/messages"],
		["https://www.facebook.com/", "facebook", "/messages"],
		["https://www.facebook.com/groups/1", "facebook", "/messages"],
	]) {
		const w = contentWorld(url, "");
		check(`kind ${url}`, w.run("Page.kind()") === kind, w.run("Page.kind()"));
		check(`chatHref ${url}`, w.run(`Page.chatHref("/t/1/")`) === `${prefix}/t/1/`);
	}
	{
		const w = contentWorld("https://www.facebook.com/messages/t/1", "");
		check("chatLinkSelectors: one per way of finding the chat list area", JSON.stringify(w.run(`Page.chatLinkSelectors("/t/1/")`)) === JSON.stringify([`[role="grid"] a[href='/messages/t/1/']`, `div[class='x1n2onr6'] a[href='/messages/t/1/']`]));
	}

	// ---------- synthetic messages pages ----------
	for (const site of ["fb", "messenger"]) {
		const url = site === "fb" ? "https://www.facebook.com/messages/t/2" : "https://www.messenger.com/t/2";
		const w = contentWorld(url, messagesPage(site, ["1", "2", "3"]));
		w.ctx.$ = (s) => w.doc.querySelector(s);
		check(`${site}: chat list is the grid's row container`, w.run(`Page.chatList() === $('[role="grid"] div[class="${CLASSES.CHATLIST}"]')`));
		check(`${site}: conversation is role=main`, w.run(`Page.conversation() === $('[role="main"]')`));
		check(`${site}: open chat identified by the URL`, JSON.stringify(w.run("Page.openChats().map(c => [c.chatUrl, c.title])")) === '[["/t/2/",null]]');
		check(`${site}: findChatLink`, w.run(`Page.findChatLink("/t/3/")?.getAttribute("href")`) === chatHref(site, "3"));
		const health = w.run("Page.health()");
		check(`${site}: health ok`, health.ok && health.chatOpen && core(health) === "main,main,main,main" && allMain(health), JSON.stringify(health));
	}
	{
		const w = contentWorld("https://www.facebook.com/messages/t/2", messagesPage("fb", ["1", "2"], { grid: false, virtualized: false }));
		check("backup: chat list found by class", w.run("Page.health().parts.chatList") === "backup 1" && w.run("Page.health().ok") === true);
	}
	{
		const w = contentWorld("https://www.facebook.com/messages/t/2", messagesPage("fb", ["1", "2"], { grid: false, classes: false }));
		check("missing chat list reported", w.run("Page.health().missing.join()") === "chatList");
	}
	{
		const w = contentWorld("https://www.facebook.com/messages/t/2", messagesPage("fb", ["1"]).replace(/<div role="main"[\s\S]*$/, ""));
		check("missing conversation reported", w.run("Page.health().missing.join()") === "conversation,messageLog,messageRow");
	}
	{
		const w = contentWorld("https://www.messenger.com/", messagesPage("messenger", ["1"]).replace(/<div role="main"[\s\S]*$/, '<div role="main"></div>'));
		const health = w.run("Page.health()");
		check("no chat open: only the chat list is required", health.ok && !health.chatOpen);
	}

	// ---------- Facebook home ----------
	{
		const w = contentWorld("https://www.facebook.com/", facebookHome());
		check("home: no chat list without the dropdown (v2 picked a story card)", w.run("Page.chatList()") === null && w.run("Page.health().ok") === true);
	}
	{
		const w = contentWorld("https://www.facebook.com/", facebookHome({ dropdown: true, popups: ["Name 2", "Name 9"] }));
		check("home: chat list is the dropdown's", w.run("Page.chatList()?.parentElement?.getAttribute('id')") === "dropdown");
		check("home: pop-ups identified by their own titles, not the hidden heading", JSON.stringify(w.run("Page.openChats().map(c => [c.chatUrl, c.title])")) === '[[null,"Name 2"],[null,"Name 9"]]');
		check("home: no conversation", w.run("Page.conversation()") === null);
	}
	{
		const w = contentWorld("https://www.facebook.com/messages/t/1", facebookHome({ dropdown: true, mainGrid: true }));
		check("main chat list preferred over the dropdown", w.run("Page.chatLists().map(l => l.parentElement.getAttribute('id')).join()") === "main-grid,dropdown");
	}

	// ---------- sanitized captures of the live pages (tests/fixtures, made with tests/tools/snapshot.js) ----------
	{
		const w = contentWorld("https://www.facebook.com/messages/t/1002", fixture("facebook-messages"));
		const health = w.run("Page.health()");
		check("live facebook.com/messages: every part found by its main way", health.ok && core(health) === "main,main,main,main" && allMain(health), JSON.stringify(health));
		check("live facebook.com/messages: four chat rows in the list", w.run("Page.chatList().children.length") >= 4 && w.run(`Page.findChatLink("/e2ee/t/1001/") !== null`));
		check("live facebook.com/messages: chat details read, with the time", JSON.stringify(w.run(`getChatInfo(Page.findChatLink("/t/1002/"))`)) === JSON.stringify({ url: "/t/1002/", img: "https://www.facebook.com/messages/t/img.png", name: "Text 3", lastMsg: "1h" }), JSON.stringify(w.run(`getChatInfo(Page.findChatLink("/t/1002/"))`)));
		check("live facebook.com/messages: stories-like class on message rows doesn't count as a chat list", w.run("Page.chatLists().length") === 1);
	}
	{
		const w = contentWorld("https://www.messenger.com/e2ee/t/1001", fixture("messenger"));
		const health = w.run("Page.health()");
		check("live messenger.com: every part found by its main way", health.ok && core(health) === "main,main,main,main" && allMain(health), JSON.stringify(health));
		check("live messenger.com: open e2ee chat identified", JSON.stringify(w.run("Page.openChats().map(c => c.chatUrl)")) === '["/e2ee/t/1001/"]');
		check("live messenger.com: all chat details read", w.run("getAllChat().map(c => c.url + ':' + c.lastMsg).join()") === "/e2ee/t/1001/:1m,/t/1002/:1h,/t/1003/:5h,/t/1004/:9h");
	}
	{
		const w = contentWorld("https://www.facebook.com/", fixture("facebook-home"));
		check("live Facebook home: the dropdown is the only chat list (the Stories grid isn't)", w.run("Page.chatLists().length") === 1 && w.run("!!Page.chatList().closest('[role=dialog]')"));
		const open = w.run("Page.openChats().map(c => [c.chatUrl, c.title])");
		check("live Facebook home: pop-up title is the chat's name from the list", JSON.stringify(open) === '[[null,"Text 3"]]' && w.run(`getChatInfo(Page.findChatLink("/t/1002/")).name`) === "Text 3", JSON.stringify(open));
		check("live Facebook home: nothing required", w.run("Page.health().ok") === true);
	}
	{
		// Who the chat is with, on the live messenger.com capture: header and info panel avatars and names, and
		// the username under the name in the info panel.
		const w = contentWorld("https://www.messenger.com/e2ee/t/1001", fixture("messenger"), stored([chat("e1001", { isObfuscated: true })]));
		const media = w.doc.querySelectorAll('[data-hc-identity="media"]');
		const texts = [...w.doc.querySelectorAll('[data-hc-identity="text"]')].map((el) => el.textContent.trim());
		check("live messenger.com: header and info panel avatars obfuscated", media.length === 2 && [...media].every((el) => el.tagName === "IMG" && !el.closest('[role="log"]')), String(media.length));
		check("live messenger.com: names and username obfuscated", texts.filter((t) => t === "Text 11").length === 2 && texts.includes("Text 46"), JSON.stringify(texts));
		check("live messenger.com: hidden headings and the message box left alone", !w.doc.querySelector('[role="log"] [data-hc-identity]') && !texts.some((t) => /Text (10|12|43|44|45)/.test(t)));
	}
	{
		// The live Facebook messages capture has a pinned message under the header: its banner shows the message.
		const w = contentWorld("https://www.facebook.com/messages/t/1002", fixture("facebook-messages"), stored([chat("1002", { isObfuscated: true })]));
		const texts = [...w.doc.querySelectorAll('[data-hc-identity="text"]')].map((el) => el.textContent.trim());
		check("live Facebook messages: header name and pinned message obfuscated", JSON.stringify(texts) === '["Text 5","Text 10Text 11"]', JSON.stringify(texts));
		check("live Facebook messages: nothing in the messages, the message box or the chat list marked", !w.doc.querySelector('[role="log"] [data-hc-identity], [role="textbox"] [data-hc-identity], [role="grid"] [data-hc-identity]'));
	}
	{
		const w = contentWorld("https://www.facebook.com/", fixture("facebook-home"), stored([chat("1002", { isObfuscated: true, chatName: "Text 3" })]));
		const texts = [...w.doc.querySelectorAll('[data-hc-identity="text"]')].map((el) => el.textContent.trim());
		check("live Facebook home: pop-up avatar and title obfuscated", texts.includes("Text 3") && w.doc.querySelectorAll('[data-hc-identity="media"]').length === 1, JSON.stringify(texts));
	}
	{
		// The engine on the live captures: an obfuscated chat's pop-up is marked, and a locked one is covered.
		const data = stored([chat("1002", { isObfuscated: true, chatName: "Text 3" })]);
		const w = contentWorld("https://www.facebook.com/", fixture("facebook-home"), data);
		check("live Facebook home: obfuscated chat's pop-up marked", w.doc.querySelector('[role="log"]').hasAttribute("data-hc-obfuscated"));
		const locked = contentWorld("https://www.facebook.com/", fixture("facebook-home"), stored([chat("1002", { isLocked: true, chatName: "Text 3" })]));
		check("live Facebook home: locked chat's pop-up covered", locked.doc.querySelector("[data-mw-file-dropzone]").hasAttribute("data-hc-popup-locked"));
	}
};
