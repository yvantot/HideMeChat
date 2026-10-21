// Locking: the lock screen in the page, its extension frame (html/lock.html), and locked pop-ups.
const { contentWorld, pageWorld, messagesPage, popup, chat, stored, errors, hashPassword, verifyPassword, waitFor } = require("./support/helpers");

const lockedChats = () => [chat("2", { isObfuscated: true }), chat("4", { isLocked: true }), chat("e5", { isLocked: true })];

module.exports = async (check) => {
	const record = await hashPassword("hunter22");
	check("hash: salted PBKDF2 record without the password", record.iterations === 600000 && !JSON.stringify(record).includes("hunter22"));
	check("hash: new salt each time", (await hashPassword("hunter22")).salt !== record.salt);
	check("verify: right password, spaces around it ignored", (await verifyPassword(" hunter22 ", record)) === true);
	check("verify: wrong password, or none set", (await verifyPassword("hunter23", record)) === false && (await verifyPassword("x", undefined)) === false);

	// ---------- in the page ----------
	{
		const w = contentWorld("https://www.facebook.com/messages/t/4", messagesPage("fb", ["2", "4", "e5"]), stored(lockedChats(), { password: record }));
		const html = w.doc.documentElement;
		const screen = w.doc.getElementById("hc-lockedmain");
		const frame = screen?.querySelector("iframe");
		check("locked: <html> flagged, lock screen first in main", html.hasAttribute("data-hc-locked") && w.doc.querySelector('[role="main"]').firstChild === screen);
		check("locked: form is an extension frame for this chat", frame?.getAttribute("src") === "chrome-extension://fakeid/html/lock.html?chat=%2Ft%2F4%2F");
		check("locked: no password field in the page itself", w.doc.querySelectorAll("input").length === 0);
		check("locked: page's own inline style untouched", w.doc.querySelector('[role="main"]').getAttribute("style") === "width: 10px");
		const lockCss = w.doc.getElementById("hidechat-lockedchat").textContent;
		check("lock CSS: hides the conversation, fades in and out", /\[role="main"\] > :not\(#hc-lockedmain\)/.test(lockCss) && lockCss.includes("#hc-lockedmain[data-leaving]") && lockCss.includes("prefers-reduced-motion"));

		w.fireWindow("message", { origin: "https://www.facebook.com", source: frame.contentWindow, data: { hidechat: "unlocked" } });
		w.fireWindow("message", { origin: "chrome-extension://fakeid", source: {}, data: { hidechat: "unlocked" } });
		w.fireWindow("message", { origin: "chrome-extension://fakeid", source: frame.contentWindow, data: { hidechat: "other" } });
		check("unlock: messages from the page, other windows or of other kinds ignored", html.hasAttribute("data-hc-locked") && !screen.hasAttribute("data-leaving"));
		w.fireWindow("message", { origin: "chrome-extension://fakeid", source: frame.contentWindow, data: { hidechat: "unlocked", chat: "/t/2/" } });
		check("unlock: the frame's own chat is unlocked, whatever the message says", !html.hasAttribute("data-hc-locked") && w.run("unlockedChats.has('/t/4/') && !unlockedChats.has('/t/2/')"));
		check("unlock: lock screen fades out, then goes", screen.hasAttribute("data-leaving") && !!w.doc.getElementById("hc-lockedmain"));
		w.clock.advance(300);
		check("unlock: removed after the fade", !w.doc.getElementById("hc-lockedmain"));
		w.fireWindow("message", { origin: "chrome-extension://fakeid", source: frame.contentWindow, data: { hidechat: "unlocked" } });

		w.location.href = "https://www.facebook.com/messages/e2ee/t/5";
		w.fireObservers();
		check("another locked chat is still locked", w.doc.getElementById("hc-lockedmain")?.getAttribute("data-chat") === "/e2ee/t/5/");
		w.location.href = "https://www.facebook.com/messages/t/4";
		w.fireObservers();
		w.clock.advance(300);
		check("an unlocked chat stays unlocked until reload", !w.doc.getElementById("hc-lockedmain") && !html.hasAttribute("data-hc-locked"));
		check("in page: no prompts or errors", !w.log.some((l) => /^(prompt|alert)/.test(l)) && errors(w).length === 0, errors(w).join(" | "));
	}
	{
		// Leaving a locked chat for another locked chat mid-fade starts a fresh lock screen.
		const w = contentWorld("https://www.messenger.com/t/4", messagesPage("messenger", ["4", "e5"]), stored(lockedChats(), { password: record }));
		w.location.href = "https://www.messenger.com/t/9";
		w.fireObservers();
		w.location.href = "https://www.messenger.com/e2ee/t/5";
		w.fireObservers();
		const screens = w.doc.querySelectorAll("#hc-lockedmain");
		check("quick switch between locked chats: one fresh lock screen", screens.length === 1 && screens[0].getAttribute("data-chat") === "/e2ee/t/5/" && !screens[0].hasAttribute("data-leaving"));
	}
	{
		const w = contentWorld("https://www.facebook.com/", `<div class="tabs">${popup("Name 4")}${popup("Name 9")}</div>`, stored(lockedChats(), { password: record }));
		const areas = w.doc.querySelectorAll("[data-mw-file-dropzone]");
		const note = [...areas[0].children].find((c) => c.getAttribute("class") === "hc-popup-lock");
		check("pop-up: locked chat covered, with a link to its page", areas[0].hasAttribute("data-hc-popup-locked") && note?.querySelector("a")?.getAttribute("href") === "/messages/t/4/");
		check("pop-up: other chat untouched", !areas[1].hasAttribute("data-hc-popup-locked"));
		w.fireObservers();
		check("pop-up: note not duplicated", [...areas[0].children].filter((c) => c.getAttribute("class") === "hc-popup-lock").length === 1);
		w.storage.messengerChats[1].isLocked = false;
		w.listeners.storageChanged.forEach((f) => f({}));
		check("pop-up: uncovered once unlocked in settings", !areas[0].hasAttribute("data-hc-popup-locked") && !areas[0].querySelector(".hc-popup-lock"));
	}

	// ---------- the frame ----------
	const frameUrl = "chrome-extension://fakeid/html/lock.html?chat=%2Ft%2F4%2F";
	{
		const w = pageWorld("lock", frameUrl, stored(lockedChats(), { password: record, userTheme: "dark" }));
		await waitFor(() => !w.doc.getElementById("unlock-form").hidden);
		check("frame: unlock form when a password exists, in the saved theme", w.doc.getElementById("create-form").hidden && w.doc.documentElement.classList.contains("dark"));
		check("frame: icon drawn", !!w.doc.querySelector(".lock-badge svg"));
		const input = w.doc.getElementById("unlock-password");
		input.value = "wrong";
		await w.doc.getElementById("unlock-form").dispatch("submit");
		check("frame: wrong password says so, shakes, posts nothing", w.doc.getElementById("unlock-message").textContent === "Wrong password." && w.doc.getElementById("unlock-form").classList.contains("shake") && w.posted.length === 0);
		input.value = "hunter22";
		await w.doc.getElementById("unlock-form").dispatch("submit");
		check("frame: right password tells the page which chat", JSON.stringify(w.posted) === JSON.stringify([{ hidechat: "unlocked", chat: "/t/4/" }]));
	}
	{
		const w = pageWorld("lock", frameUrl, { preferences: { userPassword: "oldpass1" }, messengerChats: lockedChats() });
		await waitFor(() => !w.doc.getElementById("unlock-form").hidden);
		check("frame: v2 data upgraded, password hashed", w.storage.schemaVersion === 3 && !JSON.stringify(w.storage).includes("oldpass1"));
		w.doc.getElementById("unlock-password").value = "oldpass1";
		await w.doc.getElementById("unlock-form").dispatch("submit");
		check("frame: the v2 password still unlocks", w.posted.length === 1);
	}
	{
		const w = pageWorld("lock", frameUrl, stored(lockedChats()));
		await waitFor(() => !w.doc.getElementById("create-form").hidden);
		const form = w.doc.getElementById("create-form");
		const msg = w.doc.getElementById("create-message");
		const set = (a, b) => {
			w.doc.getElementById("create-password").value = a;
			w.doc.getElementById("create-confirm").value = b;
			return form.dispatch("submit");
		};
		await set("abc", "abc");
		check("frame: too short refused", /at least 5/.test(msg.textContent) && !w.storage.preferences.password);
		await set("goodpass1", "goodpass2");
		check("frame: mismatch refused", /don't match/.test(msg.textContent) && !w.storage.preferences.password);
		await set("goodpass1", "goodpass1");
		check("frame: password saved as a hash only", !!w.storage.preferences.password?.hash && !JSON.stringify(w.storage).includes("goodpass1"));
		check("frame: then asks for it to unlock", !w.doc.getElementById("unlock-form").hidden && /Password saved/.test(w.doc.getElementById("unlock-message").textContent));
		check("frame: no errors", errors(w).length === 0, errors(w).join(" | "));
	}
};
