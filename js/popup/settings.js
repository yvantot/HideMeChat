// The settings view. Started by main.js once the popup is unlocked. Layout fixes and the report live in report.js.
const METHOD_ORDER = ["blur", "flip", "pixelate", "opacity", "redact"];

const blurRange = document.getElementById("blur-val");
const opacityRange = document.getElementById("opacity-val");
const blurDesc = document.getElementById("blur-desc");
const opacityDesc = document.getElementById("opacity-desc");
const pinnedColor = document.getElementById("pinned-color");
const passwordButton = document.getElementById("change-password");
const passwordStatus = document.getElementById("password-status");
const passwordCollapse = document.getElementById("password-collapse");
const passwordForm = document.getElementById("password-form");
const passwordCurrent = document.getElementById("password-current");
const passwordNew = document.getElementById("password-new");
const passwordConfirm = document.getElementById("password-confirm");
const passwordMessage = document.getElementById("password-message");
const importInput = document.getElementById("import-data");
const importConfirm = document.getElementById("import-confirm");
const layoutFixesSwitch = document.getElementById("layout-fixes");
const layoutFixesStatus = document.getElementById("layout-fixes-status");
const checkFixesButton = document.getElementById("check-fixes");
const reportDetails = document.getElementById("report-details");
const reportPreview = document.getElementById("report-preview");

function chips(group) {
	return [...document.querySelectorAll(`.chips[data-group="${group}"] .chip`)];
}

// The methods picked in a chip group, in the order v2 saved them.
function pickedMethods(group) {
	const picked = chips(group)
		.filter((chip) => chip.getAttribute("aria-pressed") === "true")
		.map((chip) => chip.getAttribute("data-method"));
	return METHOD_ORDER.filter((method) => picked.includes(method));
}

function showObfuscation(obfMethod) {
	for (const group of ["text", "image"]) {
		chips(group).forEach((chip) => {
			chip.setAttribute("aria-pressed", String(obfMethod[group].includes(chip.getAttribute("data-method"))));
		});
	}
	blurRange.value = obfMethod.blurIntensity;
	opacityRange.value = obfMethod.brightnessIntensity;
	blurDesc.textContent = blurRange.value;
	opacityDesc.textContent = dimLabel(opacityRange.value);
}

function showSettings(data) {
	showObfuscation(data.preferences.obfMethod);
	pinnedColor.value = data.preferences.pinnedColor;
	const hasPassword = !!data.preferences.password;
	passwordButton.textContent = passwordCollapse.classList.contains("open") ? "Close" : hasPassword ? "Change" : "Set";
	passwordStatus.textContent = hasPassword
		? "Unlocks locked chats and this popup."
		: "Not set yet. Locked chats and this popup need one.";
	passwordCurrent.hidden = !hasPassword;
	showLayoutFixes(data.preferences);
}

// Reads the latest stored data, applies `change` to it and saves it, so a save never undoes changes made
// elsewhere (in another tab, or by the right-click menu) since this page opened.
async function updateStored(change) {
	const data = await loadData();
	change(data);
	await storage.set(data);
	showToast("Saved");
}

function saveObfuscation() {
	return updateStored((data) => {
		const obfMethod = data.preferences.obfMethod;
		obfMethod.text = pickedMethods("text");
		obfMethod.image = pickedMethods("image");
		obfMethod.blurIntensity = Number(blurRange.value);
		obfMethod.brightnessIntensity = Number(opacityRange.value);
	});
}

// ---------- layout fixes ----------

async function showLayoutFixes(preferences) {
	const { pageRules, rulesCheck } = await storage.get(DEVICE_KEYS);
	layoutFixesSwitch.checked = !!preferences.layoutFixes;
	checkFixesButton.hidden = !preferences.layoutFixes;
	layoutFixesStatus.textContent = layoutFixesText(preferences, pageRules, rulesCheck);
}

async function checkLayoutFixes() {
	checkFixesButton.disabled = true;
	const result = await requestPageRules();
	checkFixesButton.disabled = false;
	if (!result.ok) showToast(result.error);
	else showToast(result.changed ? "Got new layout fixes" : "Layout fixes are up to date");
}

// ---------- password ----------

function showPasswordMessage(text, isError) {
	passwordMessage.textContent = text;
	if (isError) passwordMessage.classList.add("error");
	else passwordMessage.classList.remove("error");
}

async function togglePasswordForm() {
	const open = !passwordCollapse.classList.contains("open");
	if (open) passwordCollapse.classList.add("open");
	else passwordCollapse.classList.remove("open");
	showPasswordMessage("", false);
	showSettings(await loadData());
	if (open) (passwordCurrent.hidden ? passwordNew : passwordCurrent).focus();
}

async function savePassword(event) {
	event.preventDefault();
	const button = passwordForm.querySelector("button");
	button.disabled = true;
	try {
		const data = await loadData();
		if (data.preferences.password && !(await verifyPassword(passwordCurrent.value, data.preferences.password))) {
			showPasswordMessage("The current password is wrong.", true);
			return;
		}
		if (!isValidNewPassword(passwordNew.value)) {
			showPasswordMessage(`Use at least ${PASSWORD_MIN_LENGTH} characters.`, true);
			return;
		}
		if (passwordNew.value !== passwordConfirm.value) {
			showPasswordMessage("The new passwords don't match.", true);
			return;
		}
		data.preferences.password = await hashPassword(passwordNew.value);
		await storage.set(data);
		passwordCurrent.value = passwordNew.value = passwordConfirm.value = "";
		showPasswordMessage("Password saved.", false);
	} finally {
		button.disabled = false;
	}
}

// ---------- import ----------

let pendingImport = null;

async function chooseImportFile(event) {
	const file = event.target.files[0];
	importInput.value = "";
	if (!file) return;
	try {
		pendingImport = await readImportFile(file);
		importConfirm.hidden = false;
	} catch (error) {
		pendingImport = null;
		showToast(error.message);
	}
}

async function replaceWithImport() {
	if (!pendingImport) return;
	await replaceStoredData(pendingImport);
	pendingImport = null;
	importConfirm.hidden = true;
	showToast("Backup restored");
}

// At 0, dimmed parts are invisible until hovered.
function dimLabel(value) {
	return Number(value) === 0 ? "0 (invisible)" : String(value);
}

// ---------- view ----------

async function initSettings() {
	showSettings(await loadData());

	for (const group of ["text", "image"]) {
		chips(group).forEach((chip) => {
			chip.addEventListener("click", () => {
				chip.setAttribute("aria-pressed", String(chip.getAttribute("aria-pressed") !== "true"));
				saveObfuscation();
			});
		});
	}
	blurRange.addEventListener("input", () => (blurDesc.textContent = blurRange.value));
	opacityRange.addEventListener("input", () => (opacityDesc.textContent = dimLabel(opacityRange.value)));
	blurRange.addEventListener("change", () => saveObfuscation());
	opacityRange.addEventListener("change", () => saveObfuscation());
	document.getElementById("reset-obfuscate").addEventListener("click", () => {
		showObfuscation(defaultPreferences().obfMethod);
		saveObfuscation();
	});

	pinnedColor.addEventListener("change", () => {
		updateStored((data) => {
			data.preferences.pinnedColor = pinnedColor.value;
		});
	});

	passwordButton.addEventListener("click", () => togglePasswordForm());
	passwordForm.addEventListener("submit", savePassword);

	layoutFixesSwitch.addEventListener("change", async () => {
		await setLayoutFixes(layoutFixesSwitch.checked);
		if (layoutFixesSwitch.checked) await checkLayoutFixes();
		else showToast("Saved");
	});
	checkFixesButton.addEventListener("click", () => checkLayoutFixes());
	// The preview is made when it's opened, so it shows the page as it is now.
	reportDetails.addEventListener("toggle", async () => {
		if (reportDetails.hasAttribute("open")) reportPreview.textContent = await buildReport();
	});

	document.getElementById("export-data").addEventListener("click", () => exportDataToJson());
	importInput.addEventListener("change", chooseImportFile);
	document.getElementById("import-replace").addEventListener("click", () => replaceWithImport());
	document.getElementById("import-cancel").addEventListener("click", () => {
		pendingImport = null;
		importConfirm.hidden = true;
	});

	chrome.storage.onChanged.addListener(async (changes, area) => {
		if (area === "local") showSettings(await loadData());
	});
}
