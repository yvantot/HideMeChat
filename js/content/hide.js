// Stylesheet that hides every chat marked isHidden in the chat lists.
function hideCSS(chats) {
	const selectors = chats.filter((chat) => chat.isHidden).map((chat) => Page.chatLinkSelector(chat.chatURL));
	if (selectors.length === 0) return "";
	return `${selectors.join(", ")} { display: none !important; }`;
}
