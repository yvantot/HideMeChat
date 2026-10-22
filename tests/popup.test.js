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
		check("icons drawn", w.doc.querySelectorAll(".toggle svg").length === 8 && !!w.doc.querySelector(".theme-toggle svg"));
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
		const broken = { ok: false, missing: ["chatList", "messageRow"], showHiddenChats: false };
		const w = await open(stored([chat("1", { isHidden: true, chatName: "Secret Name" })]), { responses: { health: broken } });
		const $ = (id) => w.doc.getElementById(id);
		check("warning names what's missing", !$("page-health").hidden && /can't find the chat list, message rows on this page/.test($("page-health-text").textContent));
		check("warning offers layout fixes, saying what they mean", $("get-fixes").textContent === "Get layout fixes" && !$("page-health-hint").hidden && /GitHub sees your IP address/.test($("page-health-hint").textContent));

		// GitHub has a fix: the page picks it up, and the warning goes.
		w.runtimeResponses.pageRulesFetch = { ok: true, version: "2026-11-03", changed: true };
		const getting = $("get-fixes").dispatch("click");
		await settleAll();
		check("get fixes: turns layout fixes on and checks GitHub", w.storage.preferences.layoutFixes === true && w.log.includes('runtime.sendMessage {"message":"pageRulesFetch"}') && $("get-fixes").disabled);
		w.tabResponses.health = { ok: true, missing: [], showHiddenChats: false };
		w.clock.advance(600);
		await settleAll();
		check("get fixes: the warning fades out once the page is fine", $("page-health").classList.contains("leaving"));
		w.clock.advance(300);
		await getting;
		check("get fixes: then goes, and says so", $("page-health").hidden && $("toast").textContent === "Fixed by the latest layout rules");
	}
	{
		const broken = { ok: false, missing: ["messageRow"], showHiddenChats: false };
		const w = await open(stored([], { layoutFixes: true }), { responses: { health: broken } });
		const $ = (id) => w.doc.getElementById(id);
		check("layout fixes already on: offers a check, no explanation", $("get-fixes").textContent === "Check for fixes" && $("page-health-hint").hidden);
		w.runtimeResponses.pageRulesFetch = { ok: true, version: "2026-11-03", changed: false };
		const checking = $("get-fixes").dispatch("click");
		await settleAll();
		w.clock.advance(600);
		await checking;
		check("no fix yet: says so and points to the report", !$("page-health").hidden && /no fix for this yet. Copy the report/.test($("page-health-text").textContent) && !$("get-fixes").disabled);
		w.runtimeResponses.pageRulesFetch = { ok: false, error: "Couldn't reach GitHub." };
		await $("get-fixes").dispatch("click");
		await settleAll();
		check("check fails: says why", $("toast").textContent === "Couldn't reach GitHub." && !$("get-fixes").disabled);
	}
	{
		const at = new Date(2026, 9, 22, 10, 31, 2).getTime();
		const health = {
			kind: "messenger",
			chatOpen: true,
			ok: false,
			missing: ["messageRow"],
			showHiddenChats: false,
			parts: { chatList: "main", conversation: "backup 1", messageRow: "missing", sticker: "none", messageText: "rule 1" },
			rules: "2026-11-03",
			loadedAt: at,
			log: [
				{ kind: "rules", text: "Using layout rules 2026-11-03 from GitHub", first: at, last: at, count: 1 },
				{ kind: "error", text: "page update: TypeError: x is null", first: at, last: at + 60000, count: 4 },
			],
		};
		const w = await open(stored([chat("1", { isHidden: true, chatName: "Secret Name" })]), { tabs: [{ id: 7, url: "https://www.messenger.com/t/1" }], responses: { health } });
		await w.doc.querySelector("#page-health .copy-report").dispatch("click");
		await settleAll();
		const report = w.clipboard ?? "";
		const lines = report.split("\n");
		check("report: copied, says so", w.doc.getElementById("toast").textContent === "Report copied" && lines[0] === "Hide Me Chat 3.0.0, Chrome 141, Windows", lines[0]);
		check("report: layout fixes off", lines[1] === "Layout fixes: Off. Hide Me Chat doesn't connect to anything.");
		check("report: the page and its rules", report.includes("Page: messenger.com, with a chat open\nLayout rules on the page: 2026-11-03 from GitHub"));
		check(
			"report: each part, how it was found",
			report.includes("  chat list: found by its main way\n  open chat: found by backup way 1\n  message rows: not found, and this page needs it\n  stickers: not on the page now\n  message text: found by GitHub rule 1"),
			report
		);
		check("report: the log, with repeats counted", report.includes("Since the page loaded at 10:31:02:\n  10:31:02 Using layout rules 2026-11-03 from GitHub\n  10:31:02 (4 times, last at 10:32:02) Error in page update: TypeError: x is null"), report);
		check("report: no chat names or links", !/Secret Name|\/t\/1/.test(report));
	}
	{
		const w = await open(stored([]), { tabs: [{ id: 2, url: "https://example.com/" }] });
		await w.doc.querySelector(".copy-report").dispatch("click");
		await settleAll();
		check("report off Messenger: says there's no page to look at", /No Messenger page with Hide Me Chat running in this tab/.test(w.clipboard ?? ""));
		check("warning and report: no errors", errors(w).length === 0, errors(w).join(" | "));
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

	// ---------- views ----------
	{
		const w = await open(stored([chat("1", { isHidden: true })]));
		const chats = w.doc.getElementById("view-chats");
		const settings = w.doc.getElementById("view-settings");
		check("starts on the chats view", !chats.hidden && settings.hidden);
		const going = w.doc.querySelector('[data-go="settings"]').dispatch("click");
		check("leaving view animates out first", chats.classList.contains("leaving") && settings.hidden);
		w.clock.advance(200);
		await going;
		check("settings view shown in the same page", chats.hidden && !settings.hidden && !settings.classList.contains("back"));
		const back = w.doc.querySelector('[data-go="chats"]').dispatch("click");
		w.clock.advance(200);
		await back;
		check("back to chats slides in from the other side", !chats.hidden && settings.hidden && chats.classList.contains("back"));
		check("both views wired once, in one page", w.doc.querySelectorAll(".theme-toggle svg").length === 2 && errors(w).length === 0, errors(w).join(" | "));
	}
	{
		const w = pageWorld("popup", URL, stored([]), { tabs: messengerTab });
		check("no saved theme copy: starts light", !w.doc.documentElement.classList.contains("dark"));
	}
	{
		// theme.js runs before the page is drawn, from the copy in localStorage.
		const { createWorld } = require("./support/world");
		const { ROOT, read } = require("./support/helpers");
		const w = createWorld({ root: ROOT, files: [], href: URL, state: stored([], { userTheme: "dark" }), html: read("html/popup.html") });
		w.localStorage.set("hmc-theme", "dark");
		w.run(read("js/popup/theme.js"));
		check("saved dark theme applied before anything else runs", w.doc.documentElement.classList.contains("dark"));
	}

	// ---------- theme ----------
	{
		const w = await open(stored([chat("1", { isHidden: true })]));
		const button = w.doc.querySelector(".theme-toggle");
		await button.dispatch("click");
		const first = w.storage.preferences.userTheme;
		await button.dispatch("click");
		check("theme button saves dark then light", first === "dark" && w.storage.preferences.userTheme === "light");
		check("theme button icon follows the theme", button.getAttribute("data-icon") === "moon" && !w.doc.documentElement.classList.contains("dark"));
		check("theme copy kept for the next first paint", w.localStorage.get("hmc-theme") === "light");
	}
};
