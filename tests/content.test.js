// The content scripts: one observer, CSS features, marking, right-click details, and the messages they answer.
const { CLASSES, contentWorld, messagesPage, messages, facebookHome, chatHref, chat, stored, errors } = require("./support/helpers");

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
		check("obfuscation: text style", obf.includes(`[data-hc-obfuscated] div[data-scope='messages_table'] :is(div[dir='auto'], div[role='img'], div[class='xi81zsa x126k92a']) { opacity: 0.3 !important;transform: scaleX(-1) !important; }`));
		check("obfuscation: media merges blur and pixelate", /:is\(div:has\(> img\), div:has\(> video\), div:has\(> a > img\)\) \{ filter: blur\(5px\) url\("data:image/.test(obf));
		check("obfuscation: chat-list rows", obf.includes(`[role="grid"] a[href='/messages/t/2/'] > div`));
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
