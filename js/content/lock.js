// Chats unlocked since the page loaded. They stay unlocked until the page reloads.
const unlockedChats = new Set();
// "chrome-extension://<id>", the origin of messages from the lock frame.
const EXTENSION_ORIGIN = chrome.runtime.getURL("").replace(/\/$/, "");
// When the lock screen was last built, so a missing frame isn't rebuilt more than once a second.
let lastLockScreenBuilt = 0;

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

	const host = Page.locate.conversation().element;
	if (!host) return;
	setFlag(host, "data-hc-lock-host", true);

	const scheme = data.preferences.userTheme === "dark" ? "dark" : "light";
	const existing = document.getElementById("hc-lockedmain");
	const current =
		existing?.parentElement === host &&
		existing.getAttribute("data-chat") === chat &&
		existing.getAttribute("data-scheme") === scheme &&
		!isLeaving(existing);
	// If something removed the frame, the chat would stay covered with no way to unlock it, so the lock screen
	// is rebuilt, at most once a second.
	if (current && (existing.querySelector("iframe") || Date.now() - lastLockScreenBuilt < 1000)) return;
	existing?.remove();
	host.insertBefore(lockScreen(chat, scheme), host.firstChild);
	lastLockScreenBuilt = Date.now();
}

function isLeaving(element) {
	return element.hasAttribute("data-leaving");
}

// The lock screen fades out over the revealed chat before it's removed.
function removeLockScreen() {
	const screen = document.getElementById("hc-lockedmain");
	if (screen && !isLeaving(screen)) {
		screen.setAttribute("data-leaving", "");
		setTimeout(() => screen.remove(), 250);
	}
	document.querySelectorAll("[data-hc-lock-host]").forEach((el) => el.removeAttribute("data-hc-lock-host"));
}

// The form itself is an extension page in a frame (html/lock.html), out of reach of the page's scripts.
// Chrome paints an opaque backdrop behind a frame whose color-scheme differs from the frame element's, so the
// element gets the same scheme as the card inside; the frame reports the card's size to fit it exactly.
function lockScreen(chat, scheme) {
	const screen = document.createElement("div");
	screen.setAttribute("id", "hc-lockedmain");
	screen.setAttribute("data-chat", chat);
	screen.setAttribute("data-scheme", scheme);
	const frame = document.createElement("iframe");
	frame.setAttribute("title", "Hide Me Chat lock screen");
	frame.setAttribute("src", chrome.runtime.getURL(`html/lock.html?chat=${encodeURIComponent(chat)}`));
	frame.setAttribute("style", frameStyle(scheme, 300, 260));
	frame.addEventListener("load", () => frame.focus());
	screen.appendChild(frame);
	return screen;
}

function frameStyle(scheme, width, height) {
	return `color-scheme: ${scheme}; width: ${width}px; height: ${height}px;`;
}

// Messages from the lock frame: its card size, and "unlocked" once the right password is entered. Only messages
// from this extension's origin and the current lock frame count; the page itself can't fake either.
function listenToLockFrame(onUnlock) {
	window.addEventListener("message", (event) => {
		if (event.origin !== EXTENSION_ORIGIN) return;
		const screen = document.getElementById("hc-lockedmain");
		const frame = screen?.querySelector("iframe");
		if (!screen || isLeaving(screen) || event.source !== frame?.contentWindow) return;

		if (event.data?.hidechat === "size") {
			const fit = (value) => Math.min(Math.max(Math.round(Number(value) || 0), 120), 640);
			frame.setAttribute("style", frameStyle(screen.getAttribute("data-scheme"), fit(event.data.width), fit(event.data.height)));
		} else if (event.data?.hidechat === "unlocked") {
			unlockedChats.add(screen.getAttribute("data-chat"));
			onUnlock();
		}
	});
}

// Covers the messages of locked chats' pop-ups, which are matched to stored chats by name like obfuscation.
// Unlocking happens on the chat's own page, which the note links to.
function markLockedPopups(data) {
	const locked = lockedChats(data);
	Page.openChats().forEach(({ log, chatUrl, title }) => {
		if (chatUrl) return;
		const area = Parts.closest(log, "popupChat");
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
	text.textContent = "This chat is locked";
	const link = document.createElement("a");
	link.setAttribute("href", Page.chatHref(chatUrl));
	link.textContent = "Open to unlock";
	note.append(text, link);
	return note;
}

// Hides the last-message preview of locked chats in the chat lists. It's the block after the chat's name.
function lockedRowsCSS(chats) {
	const previews = chats
		.filter((chat) => chat.isLocked)
		.flatMap((chat) => Page.chatLinkSelectors(chat.chatURL))
		.map((link) => `${link} ${Parts.css("chatName")} ~ div`);
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
		border-radius: 14px;
		background-color: rgba(18, 20, 30, 0.45);
		backdrop-filter: blur(18px);
		animation: hc-fade-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both;
		transition: opacity 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	#hc-lockedmain[data-leaving] {
		opacity: 0;
		pointer-events: none;
	}
	#hc-lockedmain iframe {
		max-width: calc(100% - 32px);
		max-height: calc(100% - 32px);
		border: none;
		border-radius: 20px;
		background: transparent;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
		animation: hc-pop-in 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}
	@keyframes hc-pop-in {
		from {
			opacity: 0;
			transform: scale(0.96) translateY(6px);
		}
	}
	[data-hc-popup-locked] {
		position: relative !important;
	}
	[data-hc-popup-locked] > :not(.hc-popup-lock) {
		visibility: hidden !important;
	}
	.hc-popup-lock {
		position: absolute;
		inset: 10px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		border-radius: 16px;
		background-color: rgba(28, 31, 40, 0.92);
		color: #e9ebf2;
		font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
		text-align: center;
		animation: hc-fade-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}
	.hc-popup-lock p {
		margin: 0;
		font-weight: 600;
	}
	.hc-popup-lock a {
		padding: 6px 14px;
		margin-top: 6px;
		border-radius: 999px;
		background-color: #8f98ff;
		color: #14162a;
		font-weight: 600;
		text-decoration: none;
	}
	@keyframes hc-fade-in {
		from {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		#hc-lockedmain,
		#hc-lockedmain iframe,
		.hc-popup-lock {
			animation: none;
			transition: none;
		}
	}
`;
