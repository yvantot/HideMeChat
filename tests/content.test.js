// The content scripts: one observer, CSS features, marking, right-click details, and the messages they answer.
const { CLASSES, contentWorld, messagesPage, messages, facebookHome, chatHref, chatRows, chat, stored, errors } = require("./support/helpers");

const standardChats = () => [
	chat("1", { isHidden: true }),
	chat("2", { isObfuscated: true }),
	chat("3", { isPinned: true }),
	chat("4", { isLocked: true }),
	chat("e5", { isPinned: true, isObfuscated: true }),
];
const css = (w, id) => w.doc.getElementById(id)?.textContent ?? null;
const $ = (w, s) => w.doc.querySelector(s);
const $$ = (w, s) => w.doc.querySelectorAll(s);
function navigate(w, url) {
	w.location.href = url;
	w.fireObservers();
}
function reply(w, message) {
	const before = w.log.length;
	w.message(message);
	return w.log.slice(before).filter((l) => l.startsWith("sendResponse")).map((l) => JSON.parse(l.slice(13)));
}

module.exports = async (check) => {
	{
		const w = contentWorld("https://www.facebook.com/messages/t/2", messagesPage("fb", ["7", "1", "2", "3", "4", "e5"]), stored(standardChats()));
		check("no polling timers", !w.log.some((l) => /setInterval|setTimeout/.test(l)));
		check("one observer on the whole page", w.log.filter((l) => l === "new MutationObserver").length === 1 && w.log.some((l) => /^observe html\[0\] \{"childList":true,"subtree":true\}/.test(l)));

		check("hide stylesheet", css(w, "hidechat-hidden") === `[role="grid"] a[href='/messages/t/1/'], div[class='x1n2onr6'] a[href='/messages/t/1/'] { display: none !important; }`);
		const pin = css(w, "hidechat-pinned");
		check("pin: highlight", pin.includes(`[role="grid"] a[href='/messages/t/3/']`) && pin.includes("background-color: rgb(22, 33, 132) !important;"));
		check("pin: order by CSS", pin.includes("[data-hc-chatlist] { display: flex !important; flex-direction: column !important; }") && pin.includes("[data-hc-chatlist] > :has(a[href='/messages/t/3/']), [data-hc-chatlist] > :has(a[href='/messages/e2ee/t/5/']) { order: -1 !important; }"));
		check("pin: Facebook's own order untouched", w.run(`[...Page.chatList().children].map(r => r.querySelector("a").getAttribute("href")).join()`) === ["7", "1", "2", "3", "4", "e5"].map((id) => chatHref("fb", id)).join());

		const obf = css(w, "hidechat-obfuscate");
		check("obfuscation: text style, including sender names, reply headers and attachment cards", obf.includes(`[data-hc-obfuscated] div[data-scope='messages_table'] :is(div[dir='auto'], div[role='img'], div[class='xi81zsa x126k92a'], h4, a[role="link"]:not(div[dir='auto'] *)) { opacity: 0.3 !important;transform: scaleX(-1) !important; }`), obf.slice(0, 300));
		check("obfuscation: hover reveals each part", obf.includes(`a[role="link"]:not(div[dir='auto'] *)):hover { opacity: 1 !important;transform: none !important; }`));
		check("obfuscation: media (read receipts too) merges blur and pixelate", /:is\(div:has\(> img\), span:has\(> img\), div:has\(> video\), div:has\(> a > img\)\) \{ filter: blur\(5px\) url\("data:image/.test(obf));
		check("obfuscation: who the chat is with", obf.includes(`[data-hc-identity="text"] { opacity: 0.3 !important;transform: scaleX(-1) !important; }`) && /\[data-hc-identity="media"\] \{ filter: blur\(5px\)/.test(obf));
		check("obfuscation: chat-list rows, avatar included", obf.includes(`[role="grid"] a[href='/messages/t/2/'] > div`) && /\[role="grid"\] a\[href='\/messages\/t\/2\/'\] :is\(img, svg:has\(image\)\)[^{]*\{ filter: blur\(5px\)/.test(obf));
		check("locked chats: previews hidden", css(w, "hidechat-lockedrows").includes(`[role="grid"] a[href='/messages/t/4/'] span[dir="auto"] ~ div`));

		check("open obfuscated chat's log marked", $(w, '[role="log"]').hasAttribute("data-hc-obfuscated"));
		check("@blr message marked", $$(w, "[data-obfblr='true']").length === 1);
		navigate(w, "https://www.facebook.com/messages/t/3");
		check("mark removed after moving to a normal chat", !$(w, '[role="log"]').hasAttribute("data-hc-obfuscated"));

		// Messenger replaces the log when switching chats; the new one gets marked on the next change.
		const oldLog = $(w, '[role="log"]');
		const fresh = w.doc.createElement("div");
		fresh.setAttribute("role", "log");
		fresh.innerHTML = `<div class="${CLASSES.MESSAGELIST}">${messages("other @pxl")}</div>`;
		oldLog.parentNode.insertBefore(fresh, oldLog);
		oldLog.remove();
		navigate(w, "https://www.facebook.com/messages/e2ee/t/5");
		check("replaced log marked for an obfuscated e2ee chat", fresh.hasAttribute("data-hc-obfuscated") && $$(w, "[data-obfpxl='true']").length === 1);
		$(w, "[data-obfpxl='true']").textContent = "edited";
		w.fireObservers();
		check("@ rule mark removed when the text changes", $$(w, "[data-obfpxl]").length === 0);

		check("show hidden: answers the new state", JSON.stringify(reply(w, { message: "toggleHiddenAll" })) === "[true]" && css(w, "hidechat-hidden") === "");
		check("health includes the show-hidden state", reply(w, { message: "health" })[0]?.showHiddenChats === true);
		check("show hidden: toggles back", JSON.stringify(reply(w, { message: "toggleHiddenAll" })) === "[false]" && css(w, "hidechat-hidden").includes("/messages/t/1/"));

		w.storage.messengerChats.push(chat("7", { isHidden: true }));
		w.storage.preferences.obfMethod.text = ["blur"];
		w.listeners.storageChanged.forEach((f) => f({}));
		check("storage change refreshes the stylesheets", css(w, "hidechat-hidden").includes("/messages/t/7/") && css(w, "hidechat-obfuscate").includes("{ filter: blur(5px) !important; }"));

		$(w, "#hidechat-lockedchat").remove();
		w.fireObservers();
		check("stylesheets restored if the page drops them", !!css(w, "hidechat-lockedchat"));
		check("engine: no errors", errors(w).length === 0, errors(w).join(" | "));
	}
	{
		// Data from before the upgrade: nothing happens until the background has migrated it.
		const w = contentWorld("https://www.facebook.com/messages/t/2", messagesPage("fb", ["1", "2"]), { hidden_chat: ["/t/1/"] });
		check("unmigrated data: content waits", !css(w, "hidechat-hidden") && errors(w).length === 0);
		w.storage = stored([chat("1", { isHidden: true })]);
		w.listeners.storageChanged.forEach((f) => f({}));
		check("unmigrated data: applies once migrated", css(w, "hidechat-hidden").includes("/messages/t/1/"));
	}

	// ---------- black bar and dim to 0 ----------
	{
		const data = stored([chat("2", { isObfuscated: true })]);
		data.preferences.obfMethod = { text: ["redact", "opacity", "flip"], image: ["redact", "blur"], blurIntensity: 5, brightnessIntensity: 0.3 };
		const w = contentWorld("https://www.facebook.com/messages/t/2", messagesPage("fb", ["2"]), data);
		const obf = css(w, "hidechat-obfuscate");
		check("black bar on text: a solid bar over each part, gone on hover", obf.includes(`[data-hc-identity="text"] { transform: scaleX(-1) !important;position: relative !important; }`) && obf.includes(`[data-hc-identity="text"]::after { content: ""; position: absolute; inset: -2px; border-radius: 6px; background: #000;`) && obf.includes(`[data-hc-identity="text"]:hover::after { opacity: 0; }`), obf.slice(0, 400));
		check("black bar on text: dimming skipped so the bar stays solid", !/\[data-hc-identity="text"\] \{[^}]*opacity/.test(obf));
		check("black bar on media: pictures turn black, back on hover", obf.includes(`[data-hc-identity="media"] { filter: brightness(0) !important; }`) && obf.includes(`[data-hc-identity="media"]:hover { filter: none !important; }`));
		check("black bar on media: no bar element needed", !obf.includes(`[data-hc-identity="media"]::after`));

		data.preferences.obfMethod = { text: ["opacity"], image: ["opacity"], blurIntensity: 5, brightnessIntensity: 0 };
		w.storage = data;
		w.listeners.storageChanged.forEach((f) => f({}));
		check("dim 0 makes parts invisible until hovered", css(w, "hidechat-obfuscate").includes(`[data-hc-identity="text"] { opacity: 0 !important; } [data-hc-identity="text"]:hover { opacity: 1 !important; }`));
	}

	// ---------- who the chat is with: header, info panel, pop-up ----------
	{
		const rows =
			`<div data-scope="messages_table"><div><h4 dir="auto"><span dir="auto">Name 2 replied to you</span></h4><div dir="auto">hi <a role="link" href="#">example.com</a></div></div></div>` +
			`<div data-scope="messages_table"><div><a role="link" href="#" class="attachment"><span dir="auto">file.pdf</span><span dir="auto">1.2 MB</span></a></div></div>` +
			`<div data-scope="messages_table"><div><div><img src="https://cdn.example/photo.jpg"></div><span class="receipt"><img src="https://cdn.example/seen.jpg"></span></div></div>`;
		const page =
			`<div role="grid"><div class="${CLASSES.CHATLIST}">${chatRows("fb", ["2", "3"])}</div></div>` +
			`<div role="main"><div class="conversation"><div class="chat-column">` +
			`<div class="header"><div role="button" class="header-block"><div class="header-avatar"><img src="https://cdn.example/avatar.jpg"></div><div class="header-name"><div><h3 dir="auto"><span>Name 2</span></h3></div></div></div><div role="button" aria-label="Call"><svg></svg></div></div>` +
			`<div role="button" class="pinned"><svg></svg><span dir="auto">Pinned message</span><span dir="auto">meet at 6</span></div>` +
			`<div class="column"><h3>Messages</h3><div role="log"><div class="${CLASSES.MESSAGELIST}">${rows}</div></div><div role="textbox"></div><div role="button" aria-label="Send"><svg></svg></div></div>` +
			`</div><div class="panel"><div class="profile"><div class="panel-avatar"><img src="https://cdn.example/avatar-big.jpg"></div><div class="panel-name"><h3 dir="auto"><span dir="auto"><a role="link" href="#">Name 2</a></span></h3></div>` +
			`<div class="panel-username"><span dir="auto">name.two</span></div><div class="panel-actions"><div role="button"><svg></svg></div><span dir="auto">Profile</span></div></div>` +
			`<div role="button" class="panel-media"><span dir="auto">Media and files</span></div></div>` +
			`</div></div>`;
		const w = contentWorld("https://www.facebook.com/messages/t/2", page, stored([chat("2", { isObfuscated: true })]));
		const marked = (kind) => [...$$(w, `[data-hc-identity="${kind}"]`)].map((el) => el.getAttribute("class") ?? el.getAttribute("src"));
		check("identity: both avatars obfuscated, not the photos or read receipts", marked("media").join() === "https://cdn.example/avatar.jpg,https://cdn.example/avatar-big.jpg", marked("media").join());
		check("identity: header name, pinned message, info panel name and username obfuscated", marked("text").join() === "header-name,pinned,panel-name,panel-username", marked("text").join());
		check("identity: controls and the info panel's menu left alone", !$(w, '[aria-label="Call"][data-hc-identity], [aria-label="Send"][data-hc-identity], .panel-media[data-hc-identity]'));
		check("identity: nothing inside the messages or the message box marked", !$(w, '[role="log"] [data-hc-identity], [role="textbox"][data-hc-identity]'));

		navigate(w, "https://www.facebook.com/messages/t/3");
		check("identity: marks removed in a chat that isn't obfuscated", $$(w, "[data-hc-identity]").length === 0);
		navigate(w, "https://www.facebook.com/messages/t/2");
		check("identity: marks back when returning", $$(w, "[data-hc-identity]").length === 6);
		check("identity: no errors", errors(w).length === 0, errors(w).join(" | "));
	}
	{
		const w = contentWorld("https://www.facebook.com/", facebookHome({ popups: ["Name 2", "Name 9"] }), stored([chat("2", { isObfuscated: true })]));
		const windows = $$(w, ".window");
		check("pop-up identity: avatar and title of the obfuscated chat's pop-up", windows[0].querySelector(".popup-avatar img").getAttribute("data-hc-identity") === "media" && windows[0].querySelector(".popup-title").getAttribute("data-hc-identity") === "text");
		check("pop-up identity: close button and the other pop-up untouched", !windows[0].querySelector('[aria-label="Close chat"]').hasAttribute("data-hc-identity") && !windows[1].querySelector("[data-hc-identity]"));
	}

	// ---------- right-click details ----------
	for (const [label, options, expected] of [
		["current rows (one hidden span)", {}, "3h"],
		["v2-era rows (two hidden spans)", { twoHidden: true }, "3h"],
		["no separator", { noSeparator: ["3"] }, "#"],
		["a prompt instead of a time", { prompt: true }, "#"],
	]) {
		const w = contentWorld("https://www.facebook.com/messages/t/2", messagesPage("fb", ["1", "2", "3"], options), stored());
		const [info] = reply(w, { message: "getThisChat", clickedChat: "https://www.facebook.com/messages/t/3/" });
		check(`getThisChat, ${label}`, JSON.stringify(info) === JSON.stringify({ url: "/t/3/", img: "https://cdn.example/3.jpg", name: "Name 3", lastMsg: expected }), JSON.stringify(info));
	}
	{
		const w = contentWorld("https://www.facebook.com/messages/t/2", messagesPage("fb", ["1", "2"]), stored());
		check("getThisChat for a chat not in the list answers null", reply(w, { message: "getThisChat", clickedChat: "https://www.facebook.com/messages/t/99/" })[0] === null);
		check("getAllChat", reply(w, { message: "getAllChat" })[0]?.map((c) => `${c.url}:${c.lastMsg}`).join() === "/t/1/:1h,/t/2/:2h");
	}

	// ---------- Facebook home ----------
	{
		const w = contentWorld("https://www.facebook.com/", facebookHome({ dropdown: true, popups: ["Name 2", "Name 9"] }), stored(standardChats()));
		const logs = $$(w, '[role="log"]');
		check("home: obfuscated chat's pop-up obfuscated", logs[0].hasAttribute("data-hc-obfuscated"));
		check("home: other pop-up left alone (v2 obfuscated all)", !logs[1].hasAttribute("data-hc-obfuscated"));
		check("home: only the dropdown list marked", $$(w, "[data-hc-chatlist]").length === 1 && !!$(w, "#dropdown [data-hc-chatlist]"));
		check("home: no errors", errors(w).length === 0, errors(w).join(" | "));
	}
};
