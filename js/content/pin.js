let pinInterval;

// Highlights pinned chats with `pinStyle` and keeps them at the top of the chat list.
function pinChats(pinnedChats, pinStyle) {
	const pinnedUrls = new Set(pinnedChats.map((chat) => chat.chatURL));

	function applyPins() {
		const chatList = Page.chatList();
		if (!chatList) return;
		const pinnedNodes = getPinnedNodes(pinnedChats);
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

	// v2 tried to switch from polling to an observer after 10 seconds, but the observer's target never existed,
	// so pinning has always polled.
	function startPinning() {
		if (pinInterval) clearInterval(pinInterval);
		pinInterval = setInterval(() => applyPins(), 500);
	}

	whenAvail(
		() => Page.chatList(),
		() => startPinning()
	);
}

// The chat-list rows of the pinned chats that are currently rendered.
function getPinnedNodes(pinnedChats) {
	const nodes = [];
	pinnedChats.forEach((chat) => {
		const chatLink = Page.findChatLink(chat.chatURL);
		if (chatLink) nodes.push(chatLink.closest(SELECTORS.VIRTUALIZED));
	});
	return nodes;
}
