const chatList = document.getElementById("hiddenContainer");
const chatCounter = document.getElementById("chatCount");
const emptyState = document.getElementById("empty-state");
const hiddenSwitch = document.getElementById("toggle-hiddenall");
const warning = document.getElementById("page-health");
const warningText = document.getElementById("page-health-text");
const fixesHint = document.getElementById("page-health-hint");
const fixesButton = document.getElementById("get-fixes");

// Chat links open on the site of the active tab, or messenger.com.
let chatSiteBase = "https://www.messenger.com";

const FEATURES = [
	{ flag: "isHidden", className: "toggleHide", icon: "hide", on: "Hidden", off: "Hide" },
	{ flag: "isPinned", className: "togglePin", icon: "pin", on: "Pinned", off: "Pin" },
	{ flag: "isObfuscated", className: "toggleObf", icon: "blur", on: "Obfuscated", off: "Obfuscate" },
	{ flag: "isLocked", className: "toggleLock", icon: "lock", on: "Locked", off: "Lock" },
];

function displayName(chat) {
	// v1 only stored the chat's URL.
	return chat.chatName.startsWith("/") ? "Unnamed chat" : chat.chatName;
}

function chatMeta(chat) {
	const on = FEATURES.filter((feature) => chat[feature.flag]).map((feature) => feature.on);
	return on.join(" · ");
}

function avatarHtml(chat) {
	if (/^https:\/\//.test(chat.chatImg)) return `<img class="avatar" src="${escapeHtml(chat.chatImg)}" alt="" />`;
	return `<span class="avatar">${escapeHtml(displayName(chat).charAt(0).toUpperCase())}</span>`;
}

// Picture URLs from Facebook expire; fall back to the chat's initial.
function useInitialIfBroken(item, chat) {
	const image = item.querySelector("img.avatar");
	image?.addEventListener("error", () => {
		image.outerHTML = `<span class="avatar">${escapeHtml(displayName(chat).charAt(0).toUpperCase())}</span>`;
	});
}

function createItem(chat, index) {
	const item = document.createElement("li");
	item.setAttribute("class", "chat");
	item.setAttribute("data-chaturl", chat.chatURL);
	item.setAttribute("style", `--i: ${Math.min(index, 10)}`);
	// Names, messages and picture URLs come from the page, so they're escaped before going into the HTML.
	const url = escapeHtml(chat.chatURL);
	item.innerHTML = `
		${avatarHtml(chat)}
		<div class="chat-main">
			<a class="chat-name" target="_blank" rel="noreferrer"></a>
			<span class="chat-meta"></span>
		</div>
		<div class="chat-actions">
			${FEATURES.map(
				(feature) =>
					`<button type="button" class="toggle ${feature.className}" data-chaturl="${url}" data-flag="${feature.flag}">${icon(feature.icon)}</button>`
			).join("")}
		</div>`;
	item.querySelectorAll(".toggle").forEach((button) => {
		button.addEventListener("click", () => toggleFlag(chat.chatURL, button.getAttribute("data-flag")));
	});
	useInitialIfBroken(item, chat);
	updateItem(item, chat);
	return item;
}

function updateItem(item, chat) {
	const link = item.querySelector(".chat-name");
	link.textContent = displayName(chat);
	link.setAttribute("href", `${chatSiteBase}${chat.chatURL}`);
	item.querySelector(".chat-meta").textContent = chatMeta(chat);
	item.querySelectorAll(".toggle").forEach((button) => {
		const feature = FEATURES.find((f) => f.flag === button.getAttribute("data-flag"));
		const on = !!chat[feature.flag];
		button.setAttribute("aria-pressed", String(on));
		button.setAttribute("title", on ? `${feature.on}. Click to undo` : feature.off);
		button.setAttribute("aria-label", `${feature.off} ${displayName(chat)}`);
	});
}

// Updates the list in place, so only new chats animate in and only removed ones animate out.
function renderChats(data) {
	const chats = data.messengerChats;
	chatCounter.textContent = chats.length;
	emptyState.hidden = chats.length > 0;

	const existing = new Map([...chatList.children].map((item) => [item.getAttribute("data-chaturl"), item]));
	const items = chats.map((chat, index) => {
		const item = existing.get(chat.chatURL);
		existing.delete(chat.chatURL);
		if (item && !item.classList.contains("leaving")) {
			updateItem(item, chat);
			return item;
		}
		return createItem(chat, index);
	});
	items.forEach((item, index) => {
		const current = [...chatList.children].filter((child) => !child.classList.contains("leaving"))[index];
		if (current !== item) chatList.insertBefore(item, current ?? null);
	});
	existing.forEach(async (item) => {
		if (item.classList.contains("leaving")) return;
		await animateOut(item);
		item.remove();
	});
}

async function toggleFlag(chatUrl, flag) {
	const data = await loadData();
	const chat = data.messengerChats.find((c) => c.chatURL === chatUrl);
	if (!chat) return;
	chat[flag] = !chat[flag];
	await storage.set(data);
	if (flag === "isLocked" && chat.isLocked && !data.preferences.password) {
		showToast("Set a password in Settings to unlock it later");
	}
}

// Refreshes the name, picture and last message of stored chats from the chat list in the active tab.
function updateData() {
	chrome.runtime.sendMessage({ message: "updateChats" }, async (chats) => {
		if (chrome.runtime.lastError || !Array.isArray(chats)) return;
		const data = await loadData();
		let changed = false;
		chats.forEach((chat) => {
			const stored = data.messengerChats.find((c) => c.chatURL === chat.url);
			if (!stored) return;
			const fresh = { chatName: chat.name, chatImg: chat.img, lastMsg: chat.lastMsg };
			for (const [key, value] of Object.entries(fresh)) {
				if (value !== undefined && stored[key] !== value) {
					stored[key] = value;
					changed = true;
				}
			}
		});
		if (changed) await storage.set(data);
	});
}

// Connects the popup to the active Messenger tab: the "Show hidden" switch, chat links on the same site, and a
// warning when the tab can't find parts of the page Hide Me Chat needs.
async function connectToTab() {
	const tab = await getActiveTab();
	if (!tab?.url || !isValidLink(tab.url)) return;
	if (tab.url.includes("https://www.facebook.com")) chatSiteBase = "https://www.facebook.com/messages";

	chrome.tabs.sendMessage(tab.id, { message: "health" }, (health) => {
		// No answer means the content scripts aren't running in that tab yet, e.g. it was opened before install.
		if (chrome.runtime.lastError || !health) return;
		hiddenSwitch.disabled = false;
		hiddenSwitch.checked = !!health.showHiddenChats;
		if (!health.ok) showPageWarning(health.missing);
	});
	hiddenSwitch.addEventListener("change", () => {
		chrome.tabs.sendMessage(tab.id, { message: "toggleHiddenAll" }, (shown) => {
			if (!chrome.runtime.lastError) hiddenSwitch.checked = !!shown;
		});
	});
}

// Warns that the page is missing parts Hide Me Chat needs, and offers layout fixes and the report.
async function showPageWarning(missingParts) {
	const missing = missingParts.map((part) => PAGE_PARTS[part]?.label ?? part).join(", ");
	warningText.textContent = `Hide Me Chat can't find the ${missing} on this page. Messenger may have changed its layout, so some features may not work until that's fixed.`;
	const { preferences } = await loadData();
	showFixesOffer(!preferences.layoutFixes);
	warning.hidden = false;
}

// Before layout fixes are on, the warning says what turning them on means.
function showFixesOffer(off) {
	fixesButton.textContent = off ? "Get layout fixes" : "Check for fixes";
	fixesHint.hidden = !off;
}

// Turns layout fixes on if needed and checks GitHub now, then looks at the page again once it has had a moment
// to pick up new rules.
async function getLayoutFixes() {
	fixesButton.disabled = true;
	const { preferences } = await loadData();
	if (!preferences.layoutFixes) await setLayoutFixes(true);
	const result = await requestPageRules();
	showFixesOffer(false);
	if (!result.ok) {
		fixesButton.disabled = false;
		showToast(result.error);
		return;
	}
	await new Promise((resolve) => setTimeout(resolve, 600));
	const health = await askActiveTab({ message: "health" });
	fixesButton.disabled = false;
	if (health?.ok) {
		await animateOut(warning);
		warning.hidden = true;
		warning.classList.remove("leaving");
		showToast("Fixed by the latest layout rules");
	} else {
		warningText.textContent = "There's no fix for this yet. Copy the report to describe what's wrong.";
	}
}

// The chats view. Started by main.js once the popup is unlocked.
async function initChats() {
	fixesButton.addEventListener("click", () => getLayoutFixes());
	await connectToTab();
	renderChats(await loadData());
	updateData();

	storage.onChanged.addListener(async () => {
		const data = await loadData();
		// Forget chats that have no feature turned on any more. Saving triggers this listener again, so only
		// save when something was removed.
		const kept = data.messengerChats.filter((chat) => chat.isHidden || chat.isPinned || chat.isLocked || chat.isObfuscated);
		if (kept.length !== data.messengerChats.length) {
			data.messengerChats = kept;
			await storage.set(data);
		}
		renderChats(data);
	});
}
