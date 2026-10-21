const storage = chrome.storage.local;
const hiddenChatsList = document.getElementById("hiddenContainer");
const chatCounter = document.getElementById("chatCount");

// Makes every `.${buttonClass}` button flip `flag` for its chat. Turning a lock off asks for the password.
function toggleMethod(buttonClass, flag) {
	document.querySelectorAll(`.${buttonClass}`).forEach((button) => {
		button.addEventListener("click", () => {
			const chatUrl = button.getAttribute("data-chaturl");
			storage.get(null, (data) => {
				const index = data.messengerChats.findIndex((chat) => chat.chatURL === chatUrl);
				const isOn = data.messengerChats[index][flag];

				if (buttonClass === "toggleLock" && isOn) {
					if (data.preferences.userPassword) {
						if (prompt("Type your password to unlock this chat:") === data.preferences.userPassword) {
							data.messengerChats[index][flag] = false;
							storage.set(data);
						}
					}
				} else {
					data.messengerChats[index][flag] = !isOn;
					storage.set(data);
				}
			});
		});
	});
}

// Changes the password (after checking the old one), or creates one if none is set. Cancelling a prompt stops.
function setPassword() {
	storage.get(null, (data) => {
		const current = data.preferences.userPassword;
		if (current && current !== prompt("Type your old password:")) return;

		let message = current
			? "Enter a new password. The password must be at least 5 characters long:"
			: "You haven't set a password yet. The password must be at least 5 characters long:";
		let password = prompt(message);
		while (password !== null && password.length < 5) {
			message = "The password must be at least 5 characters long:";
			password = prompt(message);
		}
		if (password === null) return;

		data.preferences.userPassword = password;
		storage.set(data);
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

// Replaces all stored data with the contents of an exported file, after confirming.
function importDataToStorage(file) {
	const reader = new FileReader();
	reader.onerror = () => {
		alert("Failed: Invalid / corrupted file");
	};
	reader.onload = (event) => {
		try {
			const data = JSON.parse(decodeExport(event.target.result));
			if (typeof data != "object") {
				alert("Failed: Invalid / corrupted file");
				return;
			}
			if (confirm("This will overwrite your current data, confirm:")) storage.set(data);
		} catch (error) {
			alert("Failed: Invalid / corrupted file " + error.message);
		}
	};
	reader.readAsText(file);
}
