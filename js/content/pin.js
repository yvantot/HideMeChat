// Stylesheet that highlights pinned chats and moves them to the top of the chat lists. The lists are marked
// with data-hc-chatlist (see markChatLists) and turned into flex columns so `order` can reorder them without
// moving Facebook's own elements.
function pinCSS(chats, pinnedColor) {
	const pinned = chats.filter((chat) => chat.isPinned);
	if (pinned.length === 0) return "";

	const highlight = pinned.map((chat) => Page.chatLinkSelector(chat.chatURL)).join(", ");
	const rows = pinned
		.map((chat) => `[data-hc-chatlist] > :has(a[href='${Page.chatHref(chat.chatURL)}'])`)
		.join(", ");
	return (
		`${highlight} { background-color: ${hexToRgb(pinnedColor)} !important; } ` +
		`[data-hc-chatlist] { display: flex !important; flex-direction: column !important; } ` +
		`${rows} { order: -1 !important; }`
	);
}

function markChatLists() {
	Page.chatLists().forEach((list) => setFlag(list, "data-hc-chatlist", true));
}
