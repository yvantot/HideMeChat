let pinInterval, pinTimeout, pinObserver;

// Highlights pinned chats with `pinStyle` and keeps them at the top of the chat list.
function pinChats(pinnedChats, pinStyle) {
	const pinnedUrls = new Set(pinnedChats.map((chat) => chat.chatURL));

	function applyPins() {
		const pinnedNodes = getPinnedNodes(pinnedChats);
		const chatList = document.querySelector(SELECTORS.CHATCONTAINER);
		if (!chatList) return;
		const rows = chatList.children;

		for (let i = 0; i < rows.length; i++) {
			const chatLink = rows[i].querySelector(SELECTORS.CHATLINK);
			if (!chatLink) continue;

			if (pinnedUrls.has(getChatId(chatLink.href))) {
				chatLink.setAttribute("style", pinStyle);
			} else {
				const style = chatLink.getAttribute("style");
				if (style) chatLink.setAttribute("style", style.replace(pinStyle, ""));
				else chatLink.removeAttribute("style");
			}
		}

		// If one of the top rows isn't pinned, move all pinned rows back to the top.
		for (let i = 0; i < pinnedNodes.length; i++) {
			const chatLink = rows[i].querySelector(SELECTORS.CHATLINK);
			const chatId = getChatId(chatLink.href);
			if (!chatLink) continue;
			if (pinnedUrls.has(chatId)) continue;
			pinnedNodes.forEach((node) => chatList.insertBefore(node, chatList.firstChild));
		}
	}

	function startPinning() {
		if (pinInterval) clearInterval(pinInterval);
		if (pinTimeout) clearTimeout(pinTimeout);
		pinInterval = setInterval(() => applyPins(), 500);
		if (!isMessenger) return;

		// On Messenger pages, swap polling for an observer after 10 seconds.
		// v2 bug, kept for now: the observer's target never matches, so this restarts polling forever.
		pinTimeout = setTimeout(() => {
			if (pinInterval) clearInterval(pinInterval);
			onOrderChange(() => applyPins());
			if (!pinObserver) startPinning();
		}, 10000);
	}

	whenAvail(
		() => document.querySelector(SELECTORS.CHATCONTAINER),
		() => startPinning()
	);
}

// The chat-list rows of the pinned chats that are currently rendered.
function getPinnedNodes(pinnedChats) {
	const chatList = document.querySelector(SELECTORS.CHATCONTAINER);
	const nodes = [];
	pinnedChats.forEach((chat) => {
		const chatLink = chatList.querySelector(`a[href='${isFacebook ? "/messages" : ""}${chat.chatURL}']`);
		if (chatLink) nodes.push(chatLink.closest(SELECTORS.VIRTUALIZED));
	});
	return nodes;
}

function onOrderChange(callback) {
	const target = document.querySelector(`${SELECTORS.CHATCONTAINER} ${SELECTORS.MESSAGECONTAINER}`);
	if (!target) return;
	if (pinObserver) pinObserver.disconnect();
	pinObserver = new MutationObserver(() => callback());
	pinObserver.observe(target, { childList: true });
}
