const txtBlurChk = document.getElementById("text-blur");
const txtFlipChk = document.getElementById("text-flip");
const txtPixelChk = document.getElementById("text-pixel");
const txtDimChk = document.getElementById("text-dim");
const mdaBlurChk = document.getElementById("media-blur");
const mdaFlipChk = document.getElementById("media-flip");
const mdaPixelChk = document.getElementById("media-pixel");
const mdaDimChk = document.getElementById("media-dim");
const blurRange = document.getElementById("blur-val");
const opacityRange = document.getElementById("opacity-val");
const blurDesc = document.getElementById("blur-desc");
const opacityDesc = document.getElementById("opacity-desc");
const pinnedColor = document.getElementById("pinned-color");
const setColor = document.getElementById("change-color");
const setObfuscate = document.getElementById("set-obfuscate");
const resetObfuscate = document.getElementById("reset-obfuscate");
const changePassword = document.getElementById("change-password");
const changeLanguage = document.getElementById("change-language");
const exportData = document.getElementById("export-data");
const importData = document.getElementById("import-data");

// Checkbox for each obfuscation method, in the order the methods are saved.
const textCheckboxes = { blur: txtBlurChk, flip: txtFlipChk, pixelate: txtPixelChk, opacity: txtDimChk };
const mediaCheckboxes = { blur: mdaBlurChk, flip: mdaFlipChk, pixelate: mdaPixelChk, opacity: mdaDimChk };

function checkMethods(methods, checkboxes) {
	methods.forEach((method) => {
		if (Object.hasOwn(checkboxes, method)) checkboxes[method].checked = true;
	});
}

function getCheckedMethods(checkboxes) {
	return Object.keys(checkboxes).filter((method) => checkboxes[method].checked);
}

function initObfData(data) {
	const { obfMethod } = data.preferences;
	checkMethods(obfMethod.text, textCheckboxes);
	checkMethods(obfMethod.image, mediaCheckboxes);
	blurDesc.textContent = String(obfMethod.blurIntensity).padStart(2, "0");
	opacityDesc.textContent = String(obfMethod.brightnessIntensity).padStart(2, "0");
	blurRange.value = obfMethod.blurIntensity;
	opacityRange.value = obfMethod.brightnessIntensity;
	pinnedColor.value = data.preferences.pinnedColor;
}

// Reads the latest stored data, applies `change` to it and saves it, so a save never undoes changes made
// elsewhere (in another tab, or by the right-click menu) since this page opened.
function updateStored(change) {
	storage.get(null, (data) => {
		change(data);
		storage.set(data);
	});
}

storage.get(null, (data) => {
	themeToggle();
	initObfData(data);

	setObfuscate.addEventListener("click", () => {
		updateStored((latest) => {
			latest.preferences.obfMethod.text = getCheckedMethods(textCheckboxes);
			latest.preferences.obfMethod.image = getCheckedMethods(mediaCheckboxes);
			latest.preferences.obfMethod.blurIntensity = blurRange.value;
			latest.preferences.obfMethod.brightnessIntensity = opacityRange.value;
		});
	});

	resetObfuscate.addEventListener("click", () => {
		txtBlurChk.checked = false;
		txtFlipChk.checked = true;
		txtPixelChk.checked = false;
		txtDimChk.checked = true;
		mdaBlurChk.checked = true;
		mdaFlipChk.checked = false;
		mdaPixelChk.checked = true;
		mdaDimChk.checked = false;
		blurRange.value = 5;
		opacityRange.value = 0.3;
		blurDesc.textContent = blurRange.value.padStart(2, "0");
		opacityDesc.textContent = opacityRange.value.padStart(2, "0");
	});

	blurRange.addEventListener("change", () => {
		blurDesc.textContent = blurRange.value.padStart(2, "0");
	});
	opacityRange.addEventListener("change", () => {
		opacityDesc.textContent = opacityRange.value.padStart(2, "0");
	});

	changePassword.addEventListener("click", () => {
		setPassword();
	});
	changeLanguage.addEventListener("click", () => {
		alert(
			"I can only support English for now, but any help in translating is welcome. Please contact me at: dalmanjunivanne@gmail.com"
		);
	});

	exportData.addEventListener("click", () => {
		exportDataToJson();
	});
	importData.addEventListener("change", (event) => {
		const file = event.target.files[0];
		if (file) importDataToStorage(file);
	});

	setColor.addEventListener("click", () => {
		updateStored((latest) => {
			latest.preferences.pinnedColor = pinnedColor.value;
		});
	});
});

chrome.storage.onChanged.addListener(() => {
	storage.get(null, (data) => {
		initObfData(data);
	});
});
