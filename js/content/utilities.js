const storage = chrome.storage.local;

// Returns the details of every chat currently rendered in the chat list, or null if there are none. Each row
// of the list holds a chat's link; rows not rendered yet have none.
function getAllChat() {
	const list = Page.chatList();
	if (!list) return null;
	const chats = [...list.children].map((row) => getChatInfo(row.querySelector("a[href]"))).filter(Boolean);
	return chats.length === 0 ? null : chats;
}

function getChatInfo(chatLink) {
	if (!chatLink) return null;
	return {
		url: getChatId(chatLink.href),
		img: chatLink.querySelector("img")?.src,
		name: Parts.first("chatName", chatLink)?.innerText,
		lastMsg: getLastMessageTime(chatLink) || "#",
	};
}

// The time shown after the "·" separator in a chat row, e.g. "3h". Some rows show a prompt such as
// "Follow up?" there instead, so only text with a number counts.
function getLastMessageTime(chatLink) {
	const texts = [...chatLink.querySelectorAll("span")].filter(
		(span) => span.children.length === 0 && span.textContent.trim()
	);
	const separator = texts.findIndex(
		(span) => span.textContent.trim() === "·" && span.closest("[aria-hidden='true']")
	);
	const time = separator === -1 ? undefined : texts[separator + 1]?.textContent.trim();
	return /\d/.test(time ?? "") ? time : undefined;
}

function getChatByUrl(url) {
	return Page.findChatLink(getChatId(url));
}

// The id of the open chat, with a trailing slash so it matches the stored chat URLs.
function getCurrentChat() {
	const path = location.pathname.endsWith("/") ? location.pathname : `${location.pathname}/`;
	return getChatId(location.origin + path);
}

// Turns a full chat URL into the id stored for it, e.g. "/t/123/" or "/e2ee/t/123/".
function getChatId(url) {
	return url
		.replace("https://www.facebook.com/messages", "")
		.replace("https://www.messenger.com", "")
		.replace("/requests", "")
		.replace("/archived", "")
		.replace("/marketplace", "");
}

function hexToRgb(hex) {
	hex = hex.replace("#", "");
	const red = parseInt(hex.substring(0, 2), 16);
	const green = parseInt(hex.substring(2, 4), 16);
	const blue = parseInt(hex.substring(4, 6), 16);
	return `rgb(${red}, ${green}, ${blue})`;
}

// Adds or removes a boolean attribute, touching the element only when it changes.
function setFlag(element, name, on) {
	if (element.hasAttribute(name) !== on) {
		if (on) element.setAttribute(name, "");
		else element.removeAttribute(name);
	}
}

// Replaces the text of one of HideMeChat's stylesheets, creating it if needed.
function setStyle(id, css) {
	let style = document.getElementById(id);
	if (!style) {
		style = document.createElement("style");
		style.setAttribute("id", id);
		(document.head || document.documentElement).appendChild(style);
	}
	if (style.textContent !== css) style.textContent = css;
}
