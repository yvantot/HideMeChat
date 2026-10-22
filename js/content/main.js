// Keeps the page in line with the stored settings. Stylesheets do most of the work; apply() handles what CSS
// can't (marking chat lists and open chats, @ rules, the lock screen). One observer re-runs apply() whenever the
// page changes, which also covers moving between chats, since Messenger re-renders the page when the URL changes.
let data = null;
let showHiddenChats = false;
// Whether this page has asked the background to check GitHub for new layout rules (once per page load).
let askedForRules = false;

function refreshStyles() {
	setStyle("hidechat-hidden", showHiddenChats ? "" : hideCSS(data.messengerChats));
	setStyle("hidechat-pinned", pinCSS(data.messengerChats, data.preferences.pinnedColor));
	setStyle("hidechat-obfuscate", obfuscationCSS(data.messengerChats, data.preferences.obfMethod));
	setStyle("hidechat-obfrule", AT_RULE_CSS);
	setStyle("hidechat-lockedrows", lockedRowsCSS(data.messengerChats));
	setStyle("hidechat-lockedchat", LOCK_CSS);
}

// An error here is logged for the report (see health.js) rather than stopping later updates.
const apply = guarded("page update", () => {
	if (!data) return;
	// Pages can drop our stylesheets when they rebuild <head>.
	if (!document.getElementById("hidechat-lockedchat")) refreshStyles();
	markChatLists();
	markOpenChats(data.messengerChats);
	markAtRules();
	updateLock(data);
	markLockedPopups(data);
	watchHealth();
});

function load() {
	storage.get(
		null,
		guarded("loading settings", (stored) => {
			// Data from an older version waits until the background has upgraded it (on install or update).
			if (!stored.preferences || !Array.isArray(stored.messengerChats)) return;
			data = stored;
			const layoutFixes = !!stored.preferences.layoutFixes;
			Parts.use(layoutFixes ? stored.pageRules ?? null : null);
			refreshStyles();
			apply();
			if (layoutFixes && !askedForRules) {
				askedForRules = true;
				chrome.runtime.sendMessage({ message: "pageRulesCheck" }, () => void chrome.runtime.lastError);
			}
		})
	);
}

load();
// The last check for layout rules is saved on its own; nothing on the page depends on it.
chrome.storage.onChanged.addListener((changes) => {
	const keys = Object.keys(changes ?? {});
	if (keys.length && keys.every((key) => key === "rulesCheck")) return;
	load();
});
new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
listenToLockFrame(apply);

chrome.runtime.onMessage.addListener(
	guarded("message", (request, sender, sendResponse) => {
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
				sendResponse(showHiddenChats);
				return true;
			// What the popup's warning and report show: how each part was found, the rules in use and the log.
			case "health":
				sendResponse({
					...Page.health(),
					showHiddenChats,
					rules: Parts.rulesVersion,
					log: healthLog,
					loadedAt: pageLoadedAt,
				});
				return true;
			default:
				break;
		}
	})
);
