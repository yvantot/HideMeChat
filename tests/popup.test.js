// The popup (html/popup.html): password gate, chat list, toggles, show-hidden switch and page warnings.
const { pageWorld, chat, stored, errors, hashPassword, waitFor, settleAll } = require("./support/helpers");

const URL = "chrome-extension://fakeid/html/popup.html";
const messengerTab = [{ id: 7, url: "https://www.facebook.com/messages/t/1" }];
const items = (w) => [...w.doc.querySelectorAll("#hiddenContainer .chat")];
const pressed = (w, cls, url) => w.doc.querySelector(`.${cls}[data-chaturl='${url}']`)?.getAttribute("aria-pressed");

async function open(data, options = {}) {
	const w = pageWorld("popup", URL, data, { tabs: messengerTab, ...options });
	await settleAll();
	return w;
}

module.exports = async (check) => {
	const record = await hashPassword("hunter22");

	{
		const w = await open(stored([chat("1", { isHidden: true }), chat("2", { isPinned: true, isLocked: true })]));
		check("no password: opens right away", w.doc.getElementById("hc-gate").hidden && items(w).length === 2);
		check("version from the manifest", w.doc.getElementById("version").textContent === "Version 3.0.0");
		check("count shown", w.doc.getElementById("chatCount").textContent === "2");
		check("toggles show each chat's state", pressed(w, "toggleHide", "/t/1/") === "true" && pressed(w, "togglePin", "/t/1/") === "false" && pressed(w, "toggleLock", "/t/2/") === "true");
		check("summary line names what's on", items(w)[1].querySelector(".chat-meta").textContent === "Pinned · Locked");
		check("chat links open on the active tab's site", items(w)[0].querySelector(".chat-name").getAttribute("href") === "https://www.facebook.com/messages/t/1/");
		check("icons drawn", w.doc.querySelectorAll(".toggle svg").length === 8 && !!w.doc.querySelector("#toggle-theme svg"));
		check("no personal or promotional content", !/Hire Me|Follow me|Shoutout|Free|dalman|bsky|nopaste/i.test(w.doc.documentElement.textContent + JSON.stringify([...w.doc.querySelectorAll("a")].map((a) => a.getAttribute("href")))));

		const firstItem = items(w)[0];
		await w.doc.querySelector(".togglePin[data-chaturl='/t/1/']").dispatch("click");
		await settleAll();
		w.listeners.localChanged.forEach((f) => f({}));
		await settleAll();
		check("toggle saves the flag", w.storage.messengerChats[0].isPinned === true);
		check("list updates in place (no re-created rows)", items(w)[0] === firstItem && pressed(w, "togglePin", "/t/1/") === "true");

		await w.doc.querySelector(".toggleHide[data-chaturl='/t/1/']").dispatch("click");
		await w.doc.querySelector(".togglePin[data-chaturl='/t/1/']").dispatch("click");
		await settleAll();
		w.listeners.localChanged.forEach((f) => f({}));
		await settleAll();
		check("chat with nothing on is forgotten", w.storage.messengerChats.map((c) => c.chatURL).join() === "/t/2/");
		check("its row animates out first", firstItem.classList.contains("leaving") && items(w).includes(firstItem));
		w.clock.advance(300);
		await settleAll();
		check("then is removed", !items(w).includes(firstItem) && items(w).length === 1);
		check("popup: no errors", errors(w).length === 0, errors(w).join(" | "));
	}
	{
		const w = await open(stored([]));
		check("empty state shown with how to start", !w.doc.getElementById("empty-state").hidden && /Right-click a chat/.test(w.doc.getElementById("empty-state").textContent));
	}
	{
		const evil = `<img src=x onerror=alert(1)>`;
		const w = await open(stored([chat("1", { isHidden: true, chatName: evil, chatImg: `https://x" onerror="alert(1)`, chatURL: `/t/1/" onclick="x` })]));
		const list = w.doc.getElementById("hiddenContainer");
		check("names shown as text, not HTML", list.querySelector(".chat-name").textContent === evil && ![...list.querySelectorAll("img")].some((img) => img.getAttribute("src") === "x"));
		check("attributes can't be broken out of", !list.querySelector("[onclick]") && !list.querySelector("[onerror]"));
	}

	// ---------- show hidden switch and page warnings ----------
	{
		const w = await open(stored([chat("1", { isHidden: true })]), { responses: { health: { ok: true, missing: [], showHiddenChats: true }, toggleHiddenAll: false } });
		const toggle = w.doc.getElementById("toggle-hiddenall");
		check("show hidden: enabled on a Messenger tab, with the page's state", !toggle.disabled && toggle.checked === true);
		await toggle.dispatch("change");
		check("show hidden: follows the page's answer", toggle.checked === false && w.log.some((l) => l.includes('{"message":"toggleHiddenAll"}')));
		check("no warning when the page is healthy", w.doc.getElementById("page-health").hidden);
	}
	{
		const w = await open(stored([]), { tabs: [{ id: 2, url: "https://example.com/" }] });
		check("show hidden: disabled off Messenger", w.doc.getElementById("toggle-hiddenall").disabled);
	}
	{
		const w = await open(stored([]), { responses: { health: { ok: false, missing: ["chatList", "messages"], showHiddenChats: false } } });
		const warning = w.doc.getElementById("page-health");
		check("warning names what's missing", !warning.hidden && /can't find the chat list, messages on this page/.test(warning.textContent));
	}

	// ---------- password gate ----------
	{
		const w = await open(stored([chat("4", { isLocked: true })], { password: record }));
		await waitFor(() => !w.doc.getElementById("hc-gate").hidden, 2000);
		check("locked: gate shown, chats not rendered", !w.doc.getElementById("hc-gate").hidden && items(w).length === 0);
		w.doc.getElementById("hc-gate-password").value = "nope";
		await w.doc.getElementById("hc-gate-form").dispatch("submit");
		check("wrong password: message and a shake", w.doc.getElementById("hc-gate-message").textContent === "Wrong password." && w.doc.getElementById("hc-gate-form").classList.contains("shake") && items(w).length === 0);
		w.doc.getElementById("hc-gate-password").value = "hunter22";
		// The submit handler finishes after the gate's fade-out timer, so it's awaited once the clock moves on.
		const submitted = w.doc.getElementById("hc-gate-form").dispatch("submit");
		await waitFor(() => items(w).length === 1 && w.doc.getElementById("hc-gate").classList.contains("leaving"), 4000);
		check("right password: chats shown, gate fades out", items(w).length === 1 && w.doc.getElementById("hc-gate").classList.contains("leaving"));
		w.clock.advance(300);
		await submitted;
		check("gate gone after the fade", w.doc.getElementById("hc-gate").hidden);
		const until = w.session.popupUnlockedUntil;
		check("unlock remembered for about 5 minutes", until > Date.now() + 4.5 * 60000 && until <= Date.now() + 5 * 60000);
		await w.doc.querySelector(".toggleLock[data-chaturl='/t/4/']").dispatch("click");
		await settleAll();
		check("switching a lock off needs no second password", w.storage.messengerChats[0].isLocked === false && !w.log.some((l) => l.startsWith("prompt")));
	}
	{
		const w = await open(stored([chat("4", { isLocked: true })], { password: record }), { session: { popupUnlockedUntil: Date.now() + 60000 } });
		check("recent unlock: no password needed", w.doc.getElementById("hc-gate").hidden && items(w).length === 1);
	}

	// ---------- theme ----------
	{
		const w = await open(stored([chat("1", { isHidden: true })]));
		const button = w.doc.getElementById("toggle-theme");
		await button.dispatch("click");
		const first = w.storage.preferences.userTheme;
		await button.dispatch("click");
		check("theme button saves dark then light", first === "dark" && w.storage.preferences.userTheme === "light");
		check("theme button icon follows the theme", button.getAttribute("data-icon") === "moon" && !w.doc.documentElement.classList.contains("dark"));
	}
};
