// Helpers shared by the popup (popup.html) and settings (setting.html). Needs icons.js, password.js and
// storage.js loaded first.
const storage = chrome.storage.local;

// How long an unlock of the popup and settings pages lasts.
const POPUP_UNLOCK_MINUTES = 5;

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

// The active tab, or undefined.
async function getActiveTab() {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	return tab;
}

// Plays a CSS exit (`className` adds the end state) and resolves once it has had time to run.
function animateOut(element, className = "leaving", ms = 250) {
	element.classList.add(className);
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- theme ----------

function showTheme(dark) {
	if (dark) document.documentElement.classList.add("dark");
	else document.documentElement.classList.remove("dark");
	const button = document.getElementById("toggle-theme");
	button.setAttribute("data-icon", dark ? "sun" : "moon");
	fillIcons(button.parentElement);
}

// Applies the saved theme, and saves the new one each time the theme button is clicked.
function themeToggle() {
	storage.get(null, (data) => showTheme(data.preferences?.userTheme === "dark"));
	document.getElementById("toggle-theme").addEventListener("click", () => {
		const dark = !document.documentElement.classList.contains("dark");
		showTheme(dark);
		storage.get(null, (data) => {
			if (!data.preferences) return;
			data.preferences.userTheme = dark ? "dark" : "light";
			storage.set(data);
		});
	});
}

// ---------- password gate ----------

// Runs `onUnlocked` once the page may be used: right away when no password is set or the popup was unlocked in
// the last few minutes, otherwise after the password is entered in the gate (#hc-gate).
async function requireUnlock(onUnlocked) {
	const data = await loadData();
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
		message.textContent = "";
		const latest = await loadData();
		const correct = await verifyPassword(input.value, latest.preferences.password);
		button.disabled = false;
		input.value = "";
		if (!correct) {
			message.textContent = "Wrong password.";
			form.classList.remove("shake");
			void form.offsetWidth;
			form.classList.add("shake");
			input.focus();
			return;
		}
		await chrome.storage.session.set({ popupUnlockedUntil: Date.now() + POPUP_UNLOCK_MINUTES * 60000 });
		onUnlocked();
		await animateOut(gate);
		gate.hidden = true;
	});
}

// ---------- toast ----------

let toastTimer;

function showToast(text) {
	const toast = document.getElementById("toast");
	if (!toast) return;
	toast.textContent = text;
	toast.classList.add("show");
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => toast.classList.remove("show"), 1600);
}

// ---------- export / import ----------

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

// Downloads all stored data as base64-encoded JSON. The password is only ever stored as a hash.
async function exportDataToJson() {
	const data = await loadData();
	const blob = new Blob([encodeExport(JSON.stringify(data, null, 2))], { type: "text/plain" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `hidemechat_backup_${dateToday()}.txt`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Reads an exported file and returns its data in the current shape (files from any version work), or throws.
function readImportFile(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error("The file couldn't be read."));
		reader.onload = async (event) => {
			try {
				const parsed = JSON.parse(decodeExport(event.target.result));
				if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
				resolve(await migrateData(parsed));
			} catch {
				reject(new Error("That isn't a Hide Me Chat backup file."));
			}
		};
		reader.readAsText(file);
	});
}
