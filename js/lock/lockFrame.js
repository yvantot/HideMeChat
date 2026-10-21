// The lock screen's form. It runs in an extension frame (lock.html) inside the Messenger page, so the page's own
// scripts can't read the password as it's typed. When the right password is entered it tells the content script,
// which listens only for messages from this extension's origin and this frame.
const storage = chrome.storage.local;
const chat = new URLSearchParams(location.search).get("chat");

const unlockForm = document.getElementById("unlock-form");
const unlockPassword = document.getElementById("unlock-password");
const unlockMessage = document.getElementById("unlock-message");
const createForm = document.getElementById("create-form");
const createPassword = document.getElementById("create-password");
const createConfirm = document.getElementById("create-confirm");
const createMessage = document.getElementById("create-message");

function showMessage(element, text, isError) {
	element.textContent = text;
	if (isError) element.classList.add("hc-error");
	else element.classList.remove("hc-error");
}

function show(form) {
	unlockForm.hidden = form !== unlockForm;
	createForm.hidden = form !== createForm;
	form.querySelector("input").focus();
}

// Reads the stored data, replacing a v2 plain-text password with its hash first.
function getData() {
	return new Promise((resolve) => {
		storage.get(null, async (data) => {
			if (await upgradeLegacyPassword(data)) await storage.set(data);
			resolve(data);
		});
	});
}

async function init() {
	const data = await getData();
	show(data.preferences.password ? unlockForm : createForm);
}

unlockForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	const button = unlockForm.querySelector("button");
	button.disabled = true;
	showMessage(unlockMessage, "Checking…", false);
	const data = await getData();
	const correct = await verifyPassword(unlockPassword.value, data.preferences.password);
	button.disabled = false;
	if (correct) {
		showMessage(unlockMessage, "", false);
		parent.postMessage({ hidechat: "unlocked", chat }, "*");
	} else {
		showMessage(unlockMessage, "Wrong password.", true);
		unlockPassword.value = "";
		unlockPassword.focus();
	}
});

createForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	if (!isValidNewPassword(createPassword.value)) {
		showMessage(createMessage, `Use at least ${PASSWORD_MIN_LENGTH} characters.`, true);
		return;
	}
	if (createPassword.value !== createConfirm.value) {
		showMessage(createMessage, "The passwords don't match.", true);
		return;
	}

	const button = createForm.querySelector("button");
	button.disabled = true;
	const data = await getData();
	// Someone may have set a password in another tab meanwhile; never overwrite it from here.
	if (!data.preferences.password) {
		data.preferences.password = await hashPassword(createPassword.value);
		await storage.set(data);
	}
	button.disabled = false;
	createPassword.value = "";
	createConfirm.value = "";
	show(unlockForm);
	showMessage(unlockMessage, "Password saved. Enter it to unlock this chat.", false);
});

// The content script focuses this frame once it has loaded; pass that on to the form.
window.addEventListener("focus", () => {
	(unlockForm.hidden ? createPassword : unlockPassword).focus();
});

init();
