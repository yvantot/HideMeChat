// Adds or refreshes the stylesheet that hides every chat marked isHidden.
function makeHideInject(chats, styleId) {
	if (chats.length === 0) return;

	const style = makeHideCSS(chats, styleId, "{ display: none !important; }");
	const existing = document.getElementById(styleId);
	if (existing) existing.innerHTML = style.innerHTML;
	else document.head.appendChild(style);
}

// Temporarily shows hidden chats again, or removes that override if it's already on.
function toggleHide(chats, styleId) {
	const existing = document.getElementById(styleId);
	if (existing) {
		existing.remove();
		return;
	}
	if (chats.length === 0) return;
	document.head.appendChild(makeHideCSS(chats, styleId, "{ display: initial !important; }"));
}

function makeHideCSS(chats, styleId, declaration) {
	const style = document.createElement("style");
	style.setAttribute("id", styleId);

	let selectors = "";
	chats.forEach((chat) => {
		if (chat.isHidden) {
			selectors += `${SELECTORS.CHATCONTAINER} a[href='${isFacebook ? "/messages" : ""}${chat.chatURL}'],`;
		}
	});
	// Drop the trailing comma before adding the declaration block.
	style.innerHTML = selectors.slice(0, -1) + declaration;
	return style;
}
