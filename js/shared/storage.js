// The shape of Hide Me Chat's stored data, and upgrades from older versions. Shared by the background, the
// popup and settings pages, and the lock screen; needs password.js loaded first.
//
// Stored data (schemaVersion 3):
//   preferences: { obfMethod: { text, image, blurIntensity, brightnessIntensity }, pinnedColor, userTheme,
//                  layoutFixes, password?: { salt, hash, iterations } }
//   messengerChats: [{ chatName, chatImg, chatURL, lastMsg, dateAdded, isHidden, isLocked, isPinned, isObfuscated }]
// chatURL is "/t/<id>/" or "/e2ee/t/<id>/" on both facebook.com and messenger.com. layoutFixes may be missing in
// data saved before it existed, which means off.
const SCHEMA_VERSION = 3;

// Kept apart from the data above, per browser and never in backups: the layout rules from GitHub (pageRules)
// and the last check for them (rulesCheck). See the background.
const DEVICE_KEYS = ["pageRules", "rulesCheck"];

function defaultPreferences() {
	return {
		obfMethod: { text: ["opacity", "flip"], image: ["blur", "pixelate"], blurIntensity: 5, brightnessIntensity: 0.3 },
		pinnedColor: "#162184",
		userTheme: "light",
		layoutFixes: false,
	};
}

function dateToday() {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function needsMigration(data) {
	return data?.schemaVersion !== SCHEMA_VERSION;
}

// Returns `data` in the current shape. Handles:
//   v1: { hidden_chat: [chatURL, ...] }
//   v2: no schemaVersion, password as plain text in preferences.userPassword
//   anything partial or empty (a fresh install, a hand-edited export)
async function migrateData(data) {
	const source = data && typeof data === "object" ? data : {};
	const defaults = defaultPreferences();
	const preferences = { ...defaults, ...(source.preferences ?? {}) };
	preferences.obfMethod = { ...defaults.obfMethod, ...(source.preferences?.obfMethod ?? {}) };

	let chats = Array.isArray(source.messengerChats) ? source.messengerChats : [];
	if (Array.isArray(source.hidden_chat)) {
		const v1Chats = source.hidden_chat.map((chatURL) => ({ chatName: chatURL, chatURL, isHidden: true }));
		chats = [...chats, ...v1Chats];
	}

	const migrated = {
		schemaVersion: SCHEMA_VERSION,
		preferences,
		messengerChats: chats.filter((chat) => typeof chat?.chatURL === "string").map(normalizeChat),
	};
	await upgradeLegacyPassword(migrated);
	return migrated;
}

function normalizeChat(chat) {
	return {
		chatName: String(chat.chatName ?? chat.chatURL),
		chatImg: String(chat.chatImg ?? "#"),
		chatURL: chat.chatURL,
		lastMsg: String(chat.lastMsg ?? "#"),
		dateAdded: String(chat.dateAdded ?? dateToday()),
		isHidden: !!chat.isHidden,
		isLocked: !!chat.isLocked,
		isPinned: !!chat.isPinned,
		isObfuscated: !!chat.isObfuscated,
	};
}

// Replaces everything stored with `data`, removing keys it doesn't have (such as v1's hidden_chat). The layout
// rules belong to this browser, so they stay.
async function replaceStoredData(data) {
	const old = await chrome.storage.local.get(null);
	await chrome.storage.local.set(data);
	const obsolete = Object.keys(old).filter((key) => !(key in data) && !DEVICE_KEYS.includes(key));
	if (obsolete.length) await chrome.storage.local.remove(obsolete);
}

// The stored data in the current shape, upgrading and saving it first if it's from an older version. The layout
// rules are left out, so saving the result back can't undo a newer check for them.
async function loadData() {
	const data = await chrome.storage.local.get(null);
	DEVICE_KEYS.forEach((key) => delete data[key]);
	if (!needsMigration(data)) return data;
	const migrated = await migrateData(data);
	await replaceStoredData(migrated);
	return migrated;
}
