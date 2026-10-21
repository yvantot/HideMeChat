// Keeps the page in line with the stored settings. Stylesheets do most of the work; apply() handles what CSS
// can't (marking chat lists and open chats, @ rules, the lock screen). One observer re-runs apply() whenever the
// page changes, which also covers moving between chats, since Messenger re-renders the page when the URL changes.
let data = null;
let showHiddenChats = false;

function refreshStyles() {
	setStyle("hidechat-hidden", showHiddenChats ? "" : hideCSS(data.messengerChats));
	setStyle("hidechat-pinned", pinCSS(data.messengerChats, data.preferences.pinnedColor));
	setStyle("hidechat-obfuscate", obfuscationCSS(data.messengerChats, data.preferences.obfMethod));
	setStyle("hidechat-obfrule", AT_RULE_CSS);
	setStyle("hidechat-lockedchat", LOCK_CSS);
}

function apply() {
	if (!data) return;
	// Pages can drop our stylesheets when they rebuild <head>.
	if (!document.getElementById("hidechat-lockedchat")) refreshStyles();
	markChatLists();
	markOpenChats(data.messengerChats);
	markAtRules();
	updateLock(data, apply);
}

function load() {
	storage.get(null, (stored) => {
		data = stored;
		refreshStyles();
		apply();
	});
}

load();
chrome.storage.onChanged.addListener(load);
new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	switch (request.message) {
		case "getThisChat":
			sendResponse(getChatInfo(getChatByUrl(request.clickedChat)));
			return true;
		case "getAllChat":
			sendResponse(getAllChat());
			return true;
		case "toggleHiddenAll":
			showHiddenChats = !showHiddenChats;
			if (data) refreshStyles();
			break;
		case "health":
			sendResponse(Page.health());
			return true;
		default:
			break;
	}
});
