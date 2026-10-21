function getPinnedChats(data) {
	return data.messengerChats.filter((chat) => chat.isPinned);
}

function getPinStyle(data) {
	return `background-color: ${hexToRgb(data.preferences.pinnedColor)} !important;`;
}

function applyObfMethod(data) {
	const { text, image, blurIntensity, brightnessIntensity } = data.preferences.obfMethod;
	obfInject(text, image, blurIntensity, brightnessIntensity);
}

storage.get(null, (data) => {
	makeHideInject(data.messengerChats, "hidechat-hidden");
	obfRuleInject();
	obfRuleModifyAttr();
	applyObfMethod(data);
	makeObfInject(data.messengerChats);
	pinChats(getPinnedChats(data), getPinStyle(data));
	lockedUICSS();
	makeLockedInject(data);
});

chrome.storage.onChanged.addListener(() => {
	storage.get(null, (data) => {
		makeHideInject(data.messengerChats, "hidechat-hidden");
		pinChats(getPinnedChats(data), getPinStyle(data));
		makeLockedInject(data);
		applyObfMethod(data);
		makeObfInject(data.messengerChats);
	});
});

onUrlChanged(() => {
	isMessenger =
		location.origin.includes("https://www.messenger.com") ||
		location.href.includes("https://www.facebook.com/messages");
	isFacebook = location.origin.includes("https://www.facebook.com");

	storage.get(null, (data) => {
		makeLockedInject(data);
		makeObfInject(data.messengerChats);
		pinChats(getPinnedChats(data), getPinStyle(data));
	});
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	switch (request.message) {
		case "getThisChat":
			sendResponse(getChatInfo(getChatByUrl(request.clickedChat)));
			return true;
		case "getAllChat":
			sendResponse(getAllChat());
			return true;
		case "toggleHiddenAll":
			storage.get(null, (data) => toggleHide(data.messengerChats, "hidechat-hiddentoggle"));
			break;
		default:
			break;
	}
});
