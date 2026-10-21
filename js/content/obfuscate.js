let obfObserver, obfInterval, obfTimeout, obfIntervalChatLeft;

const PIXELATE_FILTER =
	"filter: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='b' x='0' y='0'%3E%3CfeFlood x='4' y='4' height='2' width='2'/%3E%3CfeComposite width='10' height='10'/%3E%3CfeTile result='a'/%3E%3CfeComposite in='SourceGraphic' in2='a' operator='in'/%3E%3CfeMorphology operator='dilate' radius='5'/%3E%3C/filter%3E%3C/svg%3E#b\") !important;";

// Marks the messages (and chat-list previews) of obfuscated chats so the obfuscation stylesheet applies to them.
function makeObfInject(chats) {
	const obfuscatedUrls = new Set(chats.filter((chat) => chat.isObfuscated).map((chat) => chat.chatURL));

	function startObfuscating() {
		if (obfIntervalChatLeft) clearInterval(obfIntervalChatLeft);
		obfIntervalChatLeft = setInterval(() => markChatList(obfuscatedUrls), 1000);

		if (isMessenger) {
			let messageList = document.querySelector(SELECTORS.MESSAGECONTAINER);
			const markMessages = () => {
				obfRuleModifyAttr();
				injectMessagesAttr(obfuscatedUrls.has(getCurrentChat()) ? "true" : "false", messageList);
			};

			if (obfInterval) clearInterval(obfInterval);
			if (obfTimeout) clearTimeout(obfTimeout);
			obfInterval = setInterval(() => {
				if (!messageList) messageList = document.querySelector(SELECTORS.MESSAGECONTAINER);
				if (messageList) markMessages();
			}, 500);

			// After 10 seconds, swap polling for an observer.
			// v2 bug, kept for now: markMessages keeps using the first message list, which Messenger replaces
			// when you switch chats.
			obfTimeout = setTimeout(() => {
				if (obfInterval) clearInterval(obfInterval);
				onMessageChange(markMessages);
			}, 10000);
		} else {
			if (obfInterval) clearInterval(obfInterval);
			if (obfTimeout) clearTimeout(obfTimeout);
			obfInterval = setInterval(() => {
				const messageLists = document.querySelectorAll(SELECTORS.MESSAGECONTAINER);
				obfRuleModifyAttr();
				// v2 bug, kept for now: every chat pop-up is obfuscated, whatever its own setting.
				for (let i = 0; i < messageLists.length; i++) injectMessagesAttr("true", messageLists[i]);
			}, 1000);
		}
	}

	whenAvail(
		() => document.querySelector(SELECTORS.MESSAGECONTAINER),
		() => startObfuscating()
	);
}

function markChatList(obfuscatedUrls) {
	const chatList = document.querySelector(SELECTORS.CHATCONTAINER);
	if (!chatList) return;
	const rows = chatList.children;

	for (let i = 0; i < rows.length; i++) {
		const chatLink = rows[i].querySelector(SELECTORS.CHATLINK);
		if (!chatLink) continue;
		if (!obfuscatedUrls.has(getChatId(chatLink.href))) continue;

		chatLink.querySelectorAll(`${SELECTORS.DIVIMG}, ${SELECTORS.TEXTSPAN}`).forEach((element) => {
			element = element.closest("div");
			// closest("div") is never an IMG, so pictures in the chat list get data-obftext too.
			if (element.tagName === "IMG") element?.setAttribute("data-obfmedia", "true");
			element?.setAttribute("data-obftext", "true");
		});
	}
}

// Sets data-obftext / data-obfmedia to `value` ("true" or "false") on every message in `messageList`.
function injectMessagesAttr(value, messageList) {
	if (!messageList) return;

	const selector = [
		SELECTORS.TEXT,
		SELECTORS.STICKERS,
		SELECTORS.REPLYTEXT,
		SELECTORS.VIDEO,
		SELECTORS.AIMG,
		SELECTORS.DIVIMG,
	]
		.map((part) => `${SELECTORS.MESSAGEROW} ${part}`)
		.join(", ");

	messageList.querySelectorAll(selector).forEach((element) => {
		if (element.tagName !== "VIDEO" && element.tagName !== "IMG") {
			element?.setAttribute("data-obftext", value);
		} else {
			element.closest("div")?.setAttribute("data-obfmedia", value);
		}
	});
}

// Marks messages that contain an @ rule (@pxl, @blr, @flp, @dim) so the matching style applies.
function obfRuleModifyAttr() {
	const rules = { "@pxl": "data-obfpxl", "@blr": "data-obfblr", "@flp": "data-obfflp", "@dim": "data-obfdim" };

	document.querySelectorAll(`${SELECTORS.MESSAGEROW} ${SELECTORS.TEXT}`).forEach((message) => {
		for (const [rule, attribute] of Object.entries(rules)) {
			if (message.textContent.includes(rule)) message.setAttribute(attribute, "true");
			else message.removeAttribute(attribute);
		}
	});
}

function onMessageChange(callback) {
	whenAvail(
		() => document.querySelector(`${SELECTORS.MESSAGECONTAINER}`),
		() => {
			const messageList = document.querySelector(`${SELECTORS.MESSAGECONTAINER}`);
			if (obfObserver) obfObserver.disconnect();
			obfObserver = new MutationObserver(() => setTimeout(() => callback(), 2000));
			obfObserver.observe(messageList, { childList: true });
		}
	);
}

// Replaces the stylesheet for data-obftext and data-obfmedia with the user's chosen methods.
function obfInject(textMethods, mediaMethods, blurIntensity, brightnessIntensity) {
	document.getElementById("hidechat-obfuscate")?.remove();

	// Each method: [style while obfuscated, style on hover].
	const methods = {
		blur: [`filter: blur(${blurIntensity}px) !important;`, "filter: none !important;"],
		opacity: [`opacity: ${brightnessIntensity} !important;`, "opacity: 1 !important;"],
		flip: ["transform: scaleX(-1) !important;", "transform: none !important;"],
		pixelate: [PIXELATE_FILTER, "filter: none !important;"],
	};

	// Blur and pixelate both set `filter`, so when both are picked they're merged into one declaration.
	function buildStyles(selected) {
		const combined = selected.includes("blur") && selected.includes("pixelate");
		const styles = {
			normal: "",
			hover: "",
			combinedNormal: combined
				? `${methods.blur[0].replace(" !important;", "")} ${methods.pixelate[0].replace("filter: ", "")}`
				: "",
			combinedHover: combined ? `${methods.blur[1]}` : "",
		};

		selected.forEach((method) => {
			if (methods[method] === undefined) return;
			if (combined && (method === "blur" || method === "pixelate")) return;
			styles.normal += `${methods[method][0]}`;
			styles.hover += `${methods[method][1]}`;
		});
		return styles;
	}

	const text = buildStyles(textMethods);
	const media = buildStyles(mediaMethods);

	const style = document.createElement("style");
	style.setAttribute("id", "hidechat-obfuscate");
	style.innerHTML =
		`div[data-obftext='true'] { ${text.normal} ${text.combinedNormal} } ` +
		`div[data-obftext='true']:hover { ${text.hover} ${text.combinedHover} } ` +
		`div[data-obfmedia='true'] { ${media.normal} ${media.combinedNormal} } ` +
		`div[data-obfmedia='true']:hover { ${media.hover} ${media.combinedHover}} `;
	document.head.appendChild(style);
}

// Adds the fixed styles for the @ rules.
function obfRuleInject() {
	const style = document.createElement("style");
	style.setAttribute("id", "hidechat-obfrule");
	style.innerHTML =
		`div[data-obfpxl="true"] { ${PIXELATE_FILTER} } div[data-obfpxl="true"]:hover { filter: none !important; }` +
		'div[data-obfflp="true"] { transform: scaleX(-1) !important; } div[data-obfflp="true"]:hover { transform: scaleX(1) !important; }' +
		'div[data-obfblr="true"] { filter: blur(8px) !important; } div[data-obfblr="true"]:hover { filter: blur(0px) !important; }' +
		'div[data-obfdim="true"] { opacity: 0.1 !important; } div[data-obfdim="true"]:hover { opacity: 1 !important; }';
	document.head.appendChild(style);
}
