importScripts("/js/shared/password.js", "/js/shared/storage.js", "/js/shared/pageParts.js");

const storage = chrome.storage.local;
// How often pages ask for the layout rules on GitHub to be checked, while layout fixes are on.
const PAGE_RULES_CHECK_HOURS = 24;

function createContexts() {
	const documentUrlPatterns = ["*://www.messenger.com/*", "*://www.facebook.com/*"];
	const targetUrlPatterns = [
		"*://www.messenger.com/e2ee/t/*",
		"*://www.messenger.com/t/*",
		"*://www.facebook.com/messages/t/*",
		"*://www.facebook.com/messages/e2ee/t/*",
	];
	const shared = { contexts: ["link"], documentUrlPatterns, targetUrlPatterns };

	chrome.contextMenus.create({ id: "hidechatMain", title: "Hide Me Chat", ...shared });
	const items = [
		["hideThisChat", "Hide this chat"],
		["hideAllChatExcept", "Hide all other chats"],
		["pinThisChat", "Pin this chat"],
		["obfuscateThisChat", "Obfuscate this chat"],
		["lockThisChat", "Lock this chat"],
	];
	items.forEach(([id, title]) => chrome.contextMenus.create({ id, parentId: "hidechatMain", title, ...shared }));
}

// Adds `chat` (as sent by the content script) to the stored chats with `flag` turned on, or refreshes its details
// if it's already stored. `knownUrls` holds the URLs that were stored before the update.
// Hiding resets the date the chat was added; the other flags keep it.
function upsertChat(data, knownUrls, chat, flag) {
	if (knownUrls.has(chat.url)) {
		const index = data.messengerChats.findIndex((stored) => stored.chatURL === chat.url);
		const stored = data.messengerChats[index];
		data.messengerChats[index] = {
			chatName: chat.name,
			chatImg: chat.img,
			chatURL: chat.url,
			lastMsg: chat.lastMsg,
			dateAdded: flag === "isHidden" ? dateToday() : stored.dateAdded,
			isHidden: stored.isHidden,
			isLocked: stored.isLocked,
			isPinned: stored.isPinned,
			isObfuscated: stored.isObfuscated,
			[flag]: true,
		};
	} else {
		data.messengerChats.push({
			chatName: chat.name,
			chatImg: chat.img,
			chatURL: chat.url,
			lastMsg: chat.lastMsg,
			dateAdded: dateToday(),
			isHidden: false,
			isLocked: false,
			isPinned: false,
			isObfuscated: false,
			[flag]: true,
		});
	}
}

// Asks the page for the details of the right-clicked chat, then turns `flag` on for it.
// Nothing happens if the page can't find the chat (for example a chat link outside the chat list).
function flagClickedChat(linkUrl, flag) {
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		if (!tabs[0]) return;
		chrome.tabs.sendMessage(tabs[0].id, { message: "getThisChat", clickedChat: linkUrl }, null, async (chat) => {
			if (chrome.runtime.lastError || !chat) return;
			const data = await loadData();
			upsertChat(data, new Set(data.messengerChats.map((stored) => stored.chatURL)), chat, flag);
			await storage.set(data);
		});
	});
}

// Hides every chat in the list except the right-clicked one.
function hideAllChatsExcept(linkUrl) {
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		if (!tabs[0]) return;
		chrome.tabs.sendMessage(tabs[0].id, { message: "getAllChat" }, null, async (chats) => {
			if (chrome.runtime.lastError || !Array.isArray(chats)) return;
			const data = await loadData();
			const knownUrls = new Set(data.messengerChats.map((stored) => stored.chatURL));
			const keptUrl = linkUrl.replace("https://www.facebook.com/messages", "").replace("https://www.messenger.com", "");
			chats.forEach((chat) => {
				if (chat.url !== keptUrl) upsertChat(data, knownUrls, chat, "isHidden");
			});
			await storage.set(data);
		});
	});
}

// ---------- layout fixes ----------

// Downloads the layout rules from GitHub, checks them (see cleanPageRules) and saves them for the content
// scripts, which pick them up on their own. Nothing is sent but the request itself: no cookies, no referrer.
// Resolves with { ok: true, version, changed } or { ok: false, error }, which is also saved as rulesCheck.
async function fetchPageRules() {
	const data = await loadData();
	if (!data.preferences.layoutFixes) return { ok: false, error: "Layout fixes are off." };

	let result;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 15000);
	try {
		const response = await fetch(PAGE_RULES_URL, {
			cache: "no-cache",
			credentials: "omit",
			referrerPolicy: "no-referrer",
			signal: controller.signal,
		}).catch(() => {
			throw new Error("Couldn't reach GitHub.");
		});
		if (!response.ok) throw new Error(`GitHub answered with error ${response.status}.`);
		const text = await response.text();
		if (text.length > PAGE_RULES_MAX_LENGTH) throw new Error("The rules file is too big.");
		let raw;
		try {
			raw = JSON.parse(text);
		} catch {
			throw new Error("The rules file isn't valid.");
		}
		const rules = cleanPageRules(raw, chrome.runtime.getManifest().version);
		const { pageRules } = await storage.get("pageRules");
		const changed = JSON.stringify(pageRules ?? null) !== JSON.stringify(rules);
		if (changed) await storage.set({ pageRules: rules });
		result = { ok: true, version: rules.version, changed };
	} catch (error) {
		result = { ok: false, error: error.name === "AbortError" ? "Couldn't reach GitHub." : error.message };
	} finally {
		clearTimeout(timer);
	}
	await storage.set({ rulesCheck: { at: Date.now(), ...result } });
	return result;
}

// One download at a time, however many tabs ask.
let pageRulesDownload = null;
function fetchPageRulesOnce() {
	pageRulesDownload ??= fetchPageRules().finally(() => (pageRulesDownload = null));
	return pageRulesDownload;
}

// Pages ask on load; the rules are downloaded when the last check is old enough.
async function checkPageRules() {
	const { preferences, rulesCheck } = await storage.get(["preferences", "rulesCheck"]);
	if (!preferences?.layoutFixes) return;
	if (rulesCheck && Date.now() - rulesCheck.at < PAGE_RULES_CHECK_HOURS * 3600000) return;
	await fetchPageRulesOnce();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	switch (request.message) {
		case "pageRulesCheck":
			checkPageRules().then(() => sendResponse(null));
			return true;
		// From the popup: check now, whenever the last check was.
		case "pageRulesFetch":
			fetchPageRulesOnce().then(sendResponse);
			return true;
		case "updateChats":
			chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
				const url = tabs[0]?.url ?? "";
				if (!url.includes("https://www.facebook.com") && !url.includes("https://www.messenger.com")) {
					sendResponse(null);
					return;
				}
				chrome.tabs.sendMessage(tabs[0].id, { message: "getAllChat" }, (chats) => {
					sendResponse(chrome.runtime.lastError ? null : chats);
				});
			});
			return true;
		default:
			break;
	}
});

// Runs on install and on every update: brings stored data from any older version up to date, and recreates the
// menu (the old version's items may still exist).
chrome.runtime.onInstalled.addListener(() => {
	loadData();
	chrome.contextMenus.removeAll(() => createContexts());
});

chrome.contextMenus.onClicked.addListener((info) => {
	switch (info.menuItemId) {
		case "hideThisChat":
			flagClickedChat(info.linkUrl, "isHidden");
			break;
		case "hideAllChatExcept":
			hideAllChatsExcept(info.linkUrl);
			break;
		case "obfuscateThisChat":
			flagClickedChat(info.linkUrl, "isObfuscated");
			break;
		case "pinThisChat":
			flagClickedChat(info.linkUrl, "isPinned");
			break;
		case "lockThisChat":
			flagClickedChat(info.linkUrl, "isLocked");
			break;
		default:
			break;
	}
});
