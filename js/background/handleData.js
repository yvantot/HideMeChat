importScripts("/js/shared/password.js");

let storage = chrome.storage.local;
let preferenceData = {
	obfMethod: {
		text: ["opacity", "flip"],
		image: ["blur", "pixelate"],
		blurIntensity: 5,
		brightnessIntensity: 0.3,
	},
	pinnedColor: "#162184",
	userTheme: "light",
};

function createContexts() {
	const documentUrlPatterns = ["*://www.messenger.com/*", "*://www.facebook.com/*"];
	const targetUrlPatterns = [
		"*://www.messenger.com/e2ee/t/*",
		"*://www.messenger.com/t/*",
		"*://www.facebook.com/messages/t/*",
		"*://www.facebook.com/messages/e2ee/t/*",
	];
	const shared = { contexts: ["link"], documentUrlPatterns, targetUrlPatterns };

	chrome.contextMenus.create({ id: "hidechatMain", title: "Hide Chat: Private Messenger", ...shared });
	const items = [
		["hideAllChatExcept", "Hide EVERYTHING except this chat"],
		["hideThisChat", "Hide THIS chat"],
		["pinThisChat", "Pin THIS chat"],
		["lockThisChat", "Lock THIS chat"],
		["obfuscateThisChat", "Obfuscate THIS chat"],
	];
	items.forEach(([id, title]) => chrome.contextMenus.create({ id, parentId: "hidechatMain", title, ...shared }));
}

// Creates empty storage on first install, and converts v1 data (a list of hidden chat URLs) to the v2 format.
function initStorage() {
	storage.get(null, (oldData) => {
		if (Object.keys(oldData).length === 0) {
			storage.set({ preferences: preferenceData, messengerChats: [] });
			return;
		}
		if (!oldData.hidden_chat) return;

		storage.clear();
		storage.set({ preferences: preferenceData, messengerChats: [] }, () => {
			storage.get(null, (data) => {
				oldData.hidden_chat.forEach((chatUrl) => {
					data.messengerChats.push({
						chatName: chatUrl,
						chatImg: "#",
						chatURL: chatUrl,
						lastMsg: "#",
						dateAdded: getDateNow(),
						isHidden: true,
						isLocked: false,
						isPinned: false,
						isObfuscated: false,
					});
				});
				storage.set(data);
			});
		});
	});
}

function getDateNow() {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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
			dateAdded: flag === "isHidden" ? getDateNow() : stored.dateAdded,
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
			dateAdded: getDateNow(),
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
		chrome.tabs.sendMessage(tabs[0].id, { message: "getThisChat", clickedChat: linkUrl }, null, (chat) => {
			if (chrome.runtime.lastError || !chat) return;
			storage.get(null, (data) => {
				const knownUrls = new Set(data.messengerChats.map((stored) => stored.chatURL));
				upsertChat(data, knownUrls, chat, flag);
				storage.set(data);
			});
		});
	});
}

// Hides every chat in the list except the right-clicked one.
function hideAllChatsExcept(linkUrl) {
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		if (!tabs[0]) return;
		chrome.tabs.sendMessage(tabs[0].id, { message: "getAllChat" }, null, (chats) => {
			if (chrome.runtime.lastError || !Array.isArray(chats)) return;
			storage.get(null, (data) => {
				const knownUrls = new Set(data.messengerChats.map((stored) => stored.chatURL));
				const keptUrl = linkUrl
					.replace("https://www.facebook.com/messages", "")
					.replace("https://www.messenger.com", "");
				chats.forEach((chat) => {
					if (chat.url != keptUrl) upsertChat(data, knownUrls, chat, "isHidden");
				});
				storage.set(data);
			});
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

// Replaces a plain-text password left by v2 with its hash.
function upgradeStoredPassword() {
	storage.get(null, async (data) => {
		if (await upgradeLegacyPassword(data)) storage.set(data);
	});
}

chrome.runtime.onInstalled.addListener(() => {
	initStorage();
	upgradeStoredPassword();
	// onInstalled also runs on updates, when the menu items from the old version may still exist.
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
