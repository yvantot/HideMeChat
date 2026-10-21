const storage = chrome.storage.local;

let isMessenger =
	location.origin.includes("https://www.messenger.com") || location.href.includes("https://www.facebook.com/messages");
let isFacebook = location.origin.includes("https://www.facebook.com");

const SELECTORS = {
	CHATCONTAINER: "div[class='x1n2onr6']",
	MESSAGECONTAINER: "div[class='x78zum5 xdt5ytf x1iyjqo2 x2lah0s xl56j7k x121v3j4']",
	INBOXDETAIL: "div[class='x78zum5 xdt5ytf x1iyjqo2 xs83m0k x1n2onr6']",
	INBOXDETAILRIGHT: "div[class='x78zum5 x5yr21d xmz0i5r']",
	VIRTUALIZED: "div[data-virtualized='false']",
	MESSAGEROW: "div[data-scope='messages_table']",
	CHATLINK: "a",
	TEXT: "div[dir='auto']",
	TEXTSPAN: "span[dir='auto']",
	TEXTSPANHIDDEN: "span[aria-hidden='true']",
	STICKERS: "div[role='img']",
	REPLYTEXT: "div[class='xi81zsa x126k92a']",
	VIDEO: "video",
	AIMG: "a > img",
	DIVIMG: "div > img",
};

// Returns the details of every chat currently rendered in the chat list, or null if there are none.
function getAllChat() {
	const chatLinks = document.querySelectorAll(
		`${SELECTORS.CHATCONTAINER} ${SELECTORS.VIRTUALIZED} ${SELECTORS.CHATLINK}`
	);
	if (!chatLinks) return null;

	const chats = [];
	chatLinks.forEach((chatLink) => {
		const chat = getChatInfo(chatLink);
		if (chat) chats.push(chat);
	});
	return chats.length === 0 ? null : chats;
}

function getChatInfo(chatLink) {
	const url = getChatId(chatLink.href);
	const img = chatLink.querySelector("img")?.src;
	const name = chatLink.querySelector(SELECTORS.TEXTSPAN)?.innerText;
	const lastMsg = chatLink.querySelectorAll(`${SELECTORS.TEXTSPAN} ${SELECTORS.TEXTSPANHIDDEN}`)[1]?.innerText;
	// v2 bug, kept for now: lastMsg is a const, so this throws a TypeError whenever lastMsg is missing.
	if (!lastMsg) lastMsg = "#";
	return { url, img, name, lastMsg };
}

function getChatByUrl(url) {
	const chatLink = document.querySelector(
		`${SELECTORS.CHATCONTAINER} a[href="${isFacebook ? "/messages" : ""}${getChatId(url)}"]`
	);
	if (chatLink) return chatLink;
}

// The id of the open chat, with a trailing slash so it matches the stored chat URLs.
function getCurrentChat() {
	const chars = Array.from(location.href);
	if (chars[location.href.length - 1] !== "/") chars[location.href.length] = "/";
	return getChatId(chars.join(""));
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

// Polls `check` until it returns something truthy, then runs `callback` once. Gives up after `timeout` seconds.
function whenAvail(check, callback, options = { interval: 0.5, timeout: 60 }) {
	const { interval, timeout } = options;
	let waiting = true;

	const poll = setInterval(() => {
		if (check()) {
			clearInterval(poll);
			waiting = false;
			callback();
		}
	}, interval * 1000);

	setTimeout(() => {
		if (waiting) clearInterval(poll);
	}, timeout * 1000);
}

function onUrlChanged(callback) {
	let lastUrl = location.href;
	setInterval(() => {
		if (location.href !== lastUrl) {
			callback();
			lastUrl = location.href;
		}
	}, 500);
}

function hexToRgb(hex) {
	hex = hex.replace("#", "");
	const red = parseInt(hex.substring(0, 2), 16);
	const green = parseInt(hex.substring(2, 4), 16);
	const blue = parseInt(hex.substring(4, 6), 16);
	return `rgb(${red}, ${green}, ${blue})`;
}
