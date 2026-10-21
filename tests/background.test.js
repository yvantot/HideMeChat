// The background service worker: the right-click menu, saving flagged chats, and upgrades on install/update.
const { backgroundWorld, chat, stored, prefs, errors, verifyPassword, waitFor, settleAll } = require("./support/helpers");

function click(w, menuItemId, linkUrl = "https://www.facebook.com/messages/t/2/") {
	w.listeners.menuClicked.forEach((f) => f({ menuItemId, linkUrl }));
}

module.exports = async (check) => {
	{
		const w = backgroundWorld({});
		w.listeners.installed.forEach((f) => f());
		await waitFor(() => w.storage.schemaVersion === 3);
		const menus = w.log.filter((l) => l.startsWith("contextMenus.create")).map((l) => JSON.parse(l.slice(20)).title);
		check("install: menus cleared then created", w.log.indexOf("contextMenus.removeAll") < w.log.findIndex((l) => l.startsWith("contextMenus.create")));
		check("install: clear menu titles", menus.join(" | ") === "Hide Me Chat | Hide this chat | Hide all other chats | Pin this chat | Obfuscate this chat | Lock this chat", menus.join(" | "));
		check("install: fresh storage in the current shape", w.storage.messengerChats.length === 0 && !("userPassword" in w.storage.preferences));
	}
	{
		const w = backgroundWorld({ preferences: prefs({ userPassword: "legacy1" }), messengerChats: [chat("1", { isHidden: true })] });
		w.listeners.installed.forEach((f) => f());
		await waitFor(() => w.storage.schemaVersion === 3);
		check("update from v2: password hashed, chats kept", (await verifyPassword("legacy1", w.storage.preferences.password)) && w.storage.messengerChats[0].isHidden && !("userPassword" in w.storage.preferences));
	}
	{
		const w = backgroundWorld({ hidden_chat: ["/t/1/"] });
		w.listeners.installed.forEach((f) => f());
		await waitFor(() => w.storage.schemaVersion === 3);
		check("update from v1: hidden chats kept, old key gone", w.storage.messengerChats[0]?.chatURL === "/t/1/" && !("hidden_chat" in w.storage));
	}

	// ---------- right-click actions ----------
	const base = () => stored([chat("1", { isHidden: true, isLocked: true }), chat("2", { isPinned: true, dateAdded: "2025-05-05" })]);
	const clicked = { url: "/t/2/", img: "img2", name: "Two", lastMsg: "5m" };
	for (const [id, flag] of [
		["hideThisChat", "isHidden"],
		["pinThisChat", "isPinned"],
		["obfuscateThisChat", "isObfuscated"],
		["lockThisChat", "isLocked"],
	]) {
		const w = backgroundWorld(base());
		w.tabResponses.getThisChat = clicked;
		click(w, id);
		await settleAll();
		const saved = w.storage.messengerChats.find((c) => c.chatURL === "/t/2/");
		check(`${id}: flag on, details refreshed, other flags kept`, saved[flag] === true && saved.isPinned === true && saved.chatName === "Two" && saved.lastMsg === "5m");
		check(`${id}: only hiding resets the date`, (saved.dateAdded === "2025-05-05") === (flag !== "isHidden"));
	}
	{
		const w = backgroundWorld(base());
		w.tabResponses.getThisChat = { url: "/e2ee/t/9/", img: "i", name: "Nine", lastMsg: "1h" };
		click(w, "lockThisChat");
		await settleAll();
		const added = w.storage.messengerChats.find((c) => c.chatURL === "/e2ee/t/9/");
		check("new chat added with just that flag", added?.isLocked === true && !added.isHidden && !added.isPinned && !added.isObfuscated);
	}
	{
		const w = backgroundWorld(base());
		w.tabResponses.getAllChat = [clicked, { url: "/t/3/", name: "Three", img: "i", lastMsg: "2d" }, { url: "/t/1/", name: "One", img: "i", lastMsg: "1d" }];
		click(w, "hideAllChatExcept", "https://www.messenger.com/t/3/");
		await settleAll();
		check("hide all other chats: every chat but the clicked one hidden", w.storage.messengerChats.filter((c) => c.isHidden).map((c) => c.chatURL).sort().join() === "/t/1/,/t/2/" && !w.storage.messengerChats.some((c) => c.chatURL === "/t/3/"));
	}
	{
		const w = backgroundWorld(base());
		w.tabResponses.getThisChat = undefined;
		w.tabResponses.getAllChat = null;
		click(w, "pinThisChat");
		click(w, "hideAllChatExcept");
		await settleAll();
		check("nothing found in the page: nothing saved, no errors", !w.log.some((l) => l.startsWith("storage.set")) && errors(w).length === 0, errors(w).join(" | "));
	}
	{
		const w = backgroundWorld(base());
		w.tabs = [{ id: 3, url: "https://example.com/" }];
		w.message({ message: "updateChats" });
		check("updateChats off Messenger answers null", w.log.includes("sendResponse null"));
		w.tabs = [{ id: 3 }];
		w.step("no url", () => w.message({ message: "updateChats" }));
		check("tab without a URL doesn't throw", errors(w).length === 0);
	}
};
