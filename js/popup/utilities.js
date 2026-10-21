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

// Changes the password (after checking the old one), or creates one if none is set.
// v2 bug, kept for now: cancelling the new-password prompt never ends the loop.
function setPassword(data) {
	if (data.preferences.userPassword) {
		if (data.preferences.userPassword === prompt("Type your old password:")) {
			let password = null;
			while (!password || password.length < 5) {
				password = prompt("Enter a new password. The password must be at least 5 characters long:");
				if (password && password.length >= 5) {
					data.preferences.userPassword = password;
					storage.set(data);
				}
			}
		}
	} else {
		while (!data.preferences.userPassword || data.preferences.userPassword.length < 5) {
			let password = data.preferences.userPassword;
			if (password) {
				if (password.length < 5) {
					password = prompt(
						`Your current password is '${password}'. The password must be at least 5 characters long:`
					);
				}
			} else {
				password = prompt("You haven't set a password yet. The password must be at least 5 characters long:");
			}

			if (password && password.length >= 5) {
				data.preferences.userPassword = password;
				storage.set(data);
			}
		}
	}
}

function isValidLink(url) {
	return url.includes("https://www.facebook.com") || url.includes("https://www.messenger.com");
}

function getDateNow() {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Applies the saved theme and saves the opposite one when the switch is clicked.
// v2 bug, kept for now: the saved value isn't re-read, so clicking twice saves the same theme twice.
function themeToggle() {
	const themeSwitch = document.getElementById("toggle-theme");
	storage.get(null, (data) => {
		const savedTheme = data.preferences.userTheme;
		if (savedTheme === "dark") {
			themeSwitch.checked = true;
			document.documentElement.classList.toggle("dark");
		}

		themeSwitch.addEventListener("click", () => {
			document.documentElement.classList.toggle("dark");
			data.preferences.userTheme = savedTheme == "dark" ? "light" : "dark";
			storage.set(data);
		});
	});
}

// Downloads all stored data as base64-encoded JSON.
function exportDataToJson() {
	storage.get(null, (data) => {
		const encoded = btoa(JSON.stringify(data, null, 2));
		const blob = new Blob([encoded], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `hidechat_userdata_${getDateNow()}.txt`;
		link.click();
		// v2 bug, kept for now: this should revoke `url`, not the Blob.
		URL.revokeObjectURL(blob);
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
			const data = JSON.parse(atob(event.target.result));
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
