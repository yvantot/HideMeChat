importScripts("/js/shared/password.js", "/js/shared/storage.js");

const storage = chrome.storage.local;

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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	switch (request.message) {
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
