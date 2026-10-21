// Chats unlocked since the page loaded. They stay unlocked until the page reloads.
const unlockedChats = new Set();
// "chrome-extension://<id>", the origin of messages from the lock frame.
const EXTENSION_ORIGIN = chrome.runtime.getURL("").replace(/\/$/, "");

function lockedChats(data) {
	return data.messengerChats.filter((chat) => chat.isLocked);
}

// Covers the open chat with the lock screen when it's locked and hasn't been unlocked yet.
// While <html> has data-hc-locked, everything in the conversation area except the lock screen is hidden.
function updateLock(data) {
	const chat = getCurrentChat();
	const locked =
		Page.isMessagesPage() && lockedChats(data).some((c) => c.chatURL === chat) && !unlockedChats.has(chat);

	setFlag(document.documentElement, "data-hc-locked", locked);
	if (!locked) {
		removeLockScreen();
		return;
	}

	const host = document.querySelector('[role="main"]') ?? Page.conversation();
	if (!host) return;
	setFlag(host, "data-hc-lock-host", true);

	const existing = document.getElementById("hc-lockedmain");
	if (existing?.parentElement === host && existing.getAttribute("data-chat") === chat) return;
	existing?.remove();
	host.insertBefore(lockScreen(chat), host.firstChild);
}

function removeLockScreen() {
	document.getElementById("hc-lockedmain")?.remove();
	document.querySelectorAll("[data-hc-lock-host]").forEach((el) => el.removeAttribute("data-hc-lock-host"));
}

// The form itself is an extension page in a frame (html/lock.html), out of reach of the page's scripts.
function lockScreen(chat) {
	const screen = document.createElement("div");
	screen.setAttribute("id", "hc-lockedmain");
	screen.setAttribute("data-chat", chat);
	const frame = document.createElement("iframe");
	frame.setAttribute("title", "HideMeChat lock screen");
	frame.setAttribute("src", chrome.runtime.getURL(`html/lock.html?chat=${encodeURIComponent(chat)}`));
	frame.addEventListener("load", () => frame.focus());
	screen.appendChild(frame);
	return screen;
}

// The lock frame posts a message when the right password is entered. Only messages from this extension's
// origin and the current lock frame count; the page itself can't fake either.
function listenForUnlock(onUnlock) {
	window.addEventListener("message", (event) => {
		if (event.origin !== EXTENSION_ORIGIN || event.data?.hidechat !== "unlocked") return;
		const screen = document.getElementById("hc-lockedmain");
		if (!screen || event.source !== screen.querySelector("iframe")?.contentWindow) return;
		unlockedChats.add(screen.getAttribute("data-chat"));
		onUnlock();
	});
}

// Covers the messages of locked chats' pop-ups, which are matched to stored chats by name like obfuscation.
// Unlocking happens on the chat's own page, which the note links to.
function markLockedPopups(data) {
	const locked = lockedChats(data);
	Page.openChats().forEach(({ log, chatUrl, title }) => {
		if (chatUrl) return;
		const area = log.closest("[data-mw-file-dropzone]");
		if (!area) return;
		const chat = locked.find((c) => c.chatName === title);
		const isLocked = !!chat && !unlockedChats.has(chat.chatURL);
		setFlag(area, "data-hc-popup-locked", isLocked);

		const note = [...area.children].find((child) => child.classList.contains("hc-popup-lock"));
		if (isLocked && !note) area.appendChild(popupLockNote(chat.chatURL));
		if (!isLocked) note?.remove();
	});
}

function popupLockNote(chatUrl) {
	const note = document.createElement("div");
	note.setAttribute("class", "hc-popup-lock");
	const text = document.createElement("p");
	text.textContent = "This chat is locked.";
	const link = document.createElement("a");
	link.setAttribute("href", Page.chatHref(chatUrl));
	link.textContent = "Open it to unlock";
	note.append(text, link);
	return note;
}

// Hides the last-message preview of locked chats in the chat lists. It's the block after the chat's name.
function lockedRowsCSS(chats) {
	const previews = chats
		.filter((chat) => chat.isLocked)
		.flatMap((chat) => Page.chatLinkSelector(chat.chatURL).split(", "))
		.map((link) => `${link} span[dir="auto"] ~ div`);
	if (previews.length === 0) return "";
	return `${previews.join(", ")} { visibility: hidden !important; }`;
}

const LOCK_CSS = `
	html[data-hc-locked] [data-hc-lock-host] {
		position: relative !important;
	}
	html[data-hc-locked] [role="main"] > :not(#hc-lockedmain),
	html[data-hc-locked] [data-hc-lock-host] > :not(#hc-lockedmain) {
		visibility: hidden !important;
	}
	#hc-lockedmain {
		position: absolute;
		inset: 0;
		z-index: 214748364;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(10px);
	}
	#hc-lockedmain iframe {
		width: 380px;
		max-width: 100%;
		height: 320px;
		border: none;
		background: transparent;
		color-scheme: normal;
	}
	[data-hc-popup-locked] {
		position: relative !important;
	}
	[data-hc-popup-locked] > :not(.hc-popup-lock) {
		visibility: hidden !important;
	}
	.hc-popup-lock {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		background-color: rgba(0, 0, 0, 0.8);
		color: #fafafa;
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
		font-size: 14px;
		text-align: center;
	}
	.hc-popup-lock p {
		margin: 0;
	}
	.hc-popup-lock a {
		color: #93c5fd;
		text-decoration: underline;
	}
`;
