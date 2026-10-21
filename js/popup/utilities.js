const storage = chrome.storage.local;
const hiddenChatsList = document.getElementById("hiddenContainer");
const chatCounter = document.getElementById("chatCount");

// How long an unlock of the popup and settings pages lasts.
const POPUP_UNLOCK_MINUTES = 5;

// Makes every `.${buttonClass}` button flip `flag` for its chat. The page is only usable once it's unlocked
// (see requireUnlock), so turning a lock off needs no extra password.
function toggleMethod(buttonClass, flag) {
	document.querySelectorAll(`.${buttonClass}`).forEach((button) => {
		button.addEventListener("click", () => {
			const chatUrl = button.getAttribute("data-chaturl");
			storage.get(null, (data) => {
				const index = data.messengerChats.findIndex((chat) => chat.chatURL === chatUrl);
				data.messengerChats[index][flag] = !data.messengerChats[index][flag];
				storage.set(data);
			});
		});
	});
}

// Reads the stored data, replacing a v2 plain-text password with its hash first.
function getStoredData() {
	return new Promise((resolve) => {
		storage.get(null, async (data) => {
			if (await upgradeLegacyPassword(data)) await storage.set(data);
			resolve(data);
		});
	});
}

// Runs `onUnlocked` once the page may be used: right away when no password is set or the popup was unlocked in
// the last few minutes, otherwise after the password is entered in the lock form (#hc-gate).
async function requireUnlock(onUnlocked) {
	const data = await getStoredData();
	const { popupUnlockedUntil = 0 } = await chrome.storage.session.get("popupUnlockedUntil");
	if (!data.preferences.password || popupUnlockedUntil > Date.now()) {
		onUnlocked();
		return;
	}

	const gate = document.getElementById("hc-gate");
	const form = document.getElementById("hc-gate-form");
	const input = document.getElementById("hc-gate-password");
	const message = document.getElementById("hc-gate-message");
	gate.hidden = false;
	input.focus();

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		const button = form.querySelector("button");
		button.disabled = true;
		message.textContent = "Checking…";
		const latest = await getStoredData();
		const correct = await verifyPassword(input.value, latest.preferences.password);
		button.disabled = false;
		input.value = "";
		if (!correct) {
			message.textContent = "Wrong password.";
			input.focus();
			return;
		}
		await chrome.storage.session.set({ popupUnlockedUntil: Date.now() + POPUP_UNLOCK_MINUTES * 60000 });
		gate.hidden = true;
		onUnlocked();
	});
}

function escapeHtml(text) {
	return String(text ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function isValidLink(url) {
	return url.includes("https://www.facebook.com") || url.includes("https://www.messenger.com");
}

function getDateNow() {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Applies the saved theme, and saves the new one each time the switch is clicked.
function themeToggle() {
	const themeSwitch = document.getElementById("toggle-theme");
	storage.get(null, (data) => {
		if (data.preferences.userTheme === "dark") {
			themeSwitch.checked = true;
			document.documentElement.classList.add("dark");
		}
	});

	themeSwitch.addEventListener("click", () => {
		const dark = document.documentElement.classList.toggle("dark");
		storage.get(null, (data) => {
			data.preferences.userTheme = dark ? "dark" : "light";
			storage.set(data);
		});
	});
}

// Base64 of the UTF-8 bytes of `text`, so names in any script survive.
function encodeExport(text) {
	const bytes = new TextEncoder().encode(text);
	let binary = "";
	bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
	return btoa(binary);
}

// Reverses encodeExport. Files exported by v2 hold Latin-1 rather than UTF-8, so fall back to that.
function decodeExport(base64) {
	const binary = atob(base64.trim());
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return binary;
	}
}

// Downloads all stored data as base64-encoded JSON.
function exportDataToJson() {
	storage.get(null, (data) => {
		const blob = new Blob([encodeExport(JSON.stringify(data, null, 2))], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `hidechat_userdata_${getDateNow()}.txt`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	});
}

// Replaces all stored data with the contents of an exported file, after confirming. Exports from v2 hold the
// password as plain text, which is hashed before saving.
function importDataToStorage(file) {
	const reader = new FileReader();
	reader.onerror = () => {
		alert("Failed: Invalid / corrupted file");
	};
	reader.onload = async (event) => {
		try {
			const data = JSON.parse(decodeExport(event.target.result));
			if (typeof data != "object" || data === null) {
				alert("Failed: Invalid / corrupted file");
				return;
			}
			if (!confirm("This will overwrite your current data, confirm:")) return;
			await upgradeLegacyPassword(data);
			storage.set(data);
		} catch (error) {
			alert("Failed: Invalid / corrupted file " + error.message);
		}
	};
	reader.readAsText(file);
}
