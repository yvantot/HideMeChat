// js/shared/storage.js: the schema and upgrades from v1 and v2 data.
const { createWorld } = require("./support/world");
const { ROOT, chat, prefs, verifyPassword } = require("./support/helpers");

function storageWorld(data) {
	return createWorld({ root: ROOT, files: ["js/shared/password.js", "js/shared/storage.js"], href: "chrome-extension://fakeid/", state: data });
}

module.exports = async (check) => {
	{
		const w = storageWorld({});
		const data = await w.run("loadData()");
		check("fresh install: defaults with the schema version", data.schemaVersion === 3 && data.messengerChats.length === 0 && data.preferences.pinnedColor === "#162184");
		check("fresh install: saved", w.storage.schemaVersion === 3);
		check("fresh install: no password", !("password" in data.preferences) && !("userPassword" in data.preferences));
	}
	{
		const w = storageWorld({ hidden_chat: ["/t/1/", "/e2ee/t/2/"] });
		const data = await w.run("loadData()");
		check("v1: hidden chats carried over", data.messengerChats.map((c) => `${c.chatURL}:${c.isHidden}`).join() === "/t/1/:true,/e2ee/t/2/:true");
		check("v1: old key removed", !("hidden_chat" in w.storage) && w.log.some((l) => l.startsWith('storage.remove ["hidden_chat"]')));
		check("v1: chats get every field", Object.keys(data.messengerChats[0]).join() === "chatName,chatImg,chatURL,lastMsg,dateAdded,isHidden,isLocked,isPinned,isObfuscated");
	}
	{
		const v2 = { preferences: prefs({ userPassword: "oldpass1", obfMethod: { text: ["blur"], image: [] } }), messengerChats: [chat("3", { isPinned: true })] };
		const w = storageWorld(v2);
		const data = await w.run("loadData()");
		check("v2: password hashed, text removed", !("userPassword" in data.preferences) && (await verifyPassword("oldpass1", data.preferences.password)) && !JSON.stringify(w.storage).includes("oldpass1"));
		check("v2: chats and settings kept", data.messengerChats[0].isPinned === true && data.preferences.obfMethod.text.join() === "blur");
		check("v2: missing obfuscation values filled in", data.preferences.obfMethod.blurIntensity === 5 && data.preferences.obfMethod.brightnessIntensity === 0.3);
		const sets = w.log.filter((l) => l.startsWith("storage.set")).length;
		await w.run("loadData()");
		check("current data isn't migrated again", w.log.filter((l) => l.startsWith("storage.set")).length === sets);
	}
	{
		const w = storageWorld({});
		const messy = { preferences: { userTheme: "dark" }, messengerChats: [{ chatURL: "/t/9/", isHidden: 1 }, { nope: true }, null, "x"] };
		w.ctx.messy = messy;
		const data = await w.run("migrateData(messy)");
		check("partial data: bad chat entries dropped", data.messengerChats.length === 1 && data.messengerChats[0].isHidden === true && data.messengerChats[0].chatName === "/t/9/");
		check("partial data: defaults fill the gaps", data.preferences.userTheme === "dark" && data.preferences.obfMethod.image.join() === "blur,pixelate");
		const nothing = await w.run("migrateData(null)");
		check("non-object data becomes empty defaults", nothing.messengerChats.length === 0 && nothing.schemaVersion === 3);
	}
	{
		const w = storageWorld({ schemaVersion: 3, preferences: prefs(), messengerChats: [], leftover: 1 });
		w.ctx.next = { schemaVersion: 3, preferences: prefs(), messengerChats: [chat("4")] };
		await w.run("replaceStoredData(next)");
		check("replaceStoredData drops keys the new data doesn't have", !("leftover" in w.storage) && w.storage.messengerChats.length === 1);
	}
	{
		// The layout rules from GitHub belong to this browser: not part of the data that's saved back or replaced.
		const device = { pageRules: { version: "v1", parts: {}, skipped: 0 }, rulesCheck: { at: 1, ok: true } };
		const w = storageWorld({ schemaVersion: 3, preferences: prefs(), messengerChats: [], ...device });
		const data = await w.run("loadData()");
		check("layout rules left out of the loaded data", !("pageRules" in data) && !("rulesCheck" in data) && "pageRules" in w.storage);
		w.ctx.next = { schemaVersion: 3, preferences: prefs(), messengerChats: [chat("4")] };
		await w.run("replaceStoredData(next)");
		check("layout rules kept when the data is replaced (an import)", JSON.stringify(w.storage.pageRules) === JSON.stringify(device.pageRules) && w.storage.rulesCheck.ok === true);
		const fresh = await storageWorld({}).run("loadData()");
		check("layout fixes off by default", fresh.preferences.layoutFixes === false);
	}
};
