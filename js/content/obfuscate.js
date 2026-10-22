const PIXELATE_URL =
	"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='b' x='0' y='0'%3E%3CfeFlood x='4' y='4' height='2' width='2'/%3E%3CfeComposite width='10' height='10'/%3E%3CfeTile result='a'/%3E%3CfeComposite in='SourceGraphic' in2='a' operator='in'/%3E%3CfeMorphology operator='dilate' radius='5'/%3E%3C/filter%3E%3C/svg%3E#b\")";
const PIXELATE_FILTER = `filter: ${PIXELATE_URL} !important;`;

// The black bar laid over text by the "redact" method.
const BLACK_BAR =
	'content: ""; position: absolute; inset: -2px; border-radius: 6px; background: #000; pointer-events: none; transition: opacity 0.2s;';

// Message parts that get the text or media style. Text: the message, stickers, quoted replies, sender names and
// "… replied to you" (h4), and attachment cards (links inside the text are already covered by it). Media is
// styled through the element wrapping it: photos, videos, avatars and read receipts.
function obfuscatedText() {
	const text = Parts.css("messageText");
	return `${Parts.css("messageRow")} :is(${text}, ${Parts.css("sticker")}, ${Parts.css("replyText")}, h4, a[role="link"]:not(${text} *))`;
}

function obfuscatedMedia() {
	return `${Parts.css("messageRow")} :is(div:has(> img), span:has(> img), div:has(> video), div:has(> a > img))`;
}

// Stylesheet for obfuscated chats:
//   - the messages of open chats whose log is marked data-hc-obfuscated (see markOpenChats);
//   - who those chats are with (avatar, name) in their header, info panel or pop-up, marked data-hc-identity;
//   - the rows of obfuscated chats in the chat lists, avatar included.
function obfuscationCSS(chats, obfMethod) {
	const text = obfStyles(obfMethod.text, obfMethod, "text");
	const media = obfStyles(obfMethod.image, obfMethod, "media");
	const rule = (selector, styles) => {
		let css = `${selector} { ${styles.normal} } ${suffixed(selector, ":hover")} { ${styles.hover} } `;
		if (styles.bar) {
			css += `${suffixed(selector, "::after")} { ${BLACK_BAR} } ${suffixed(selector, ":hover::after")} { opacity: 0; } `;
		}
		return css;
	};

	let css =
		rule(`[data-hc-obfuscated] ${obfuscatedText()}`, text) +
		rule(`[data-hc-obfuscated] ${obfuscatedMedia()}`, media) +
		rule(`[data-hc-identity="text"]`, text) +
		rule(`[data-hc-identity="media"]`, media);

	const links = chats
		.filter((chat) => chat.isObfuscated)
		.flatMap((chat) => Page.chatLinkSelectors(chat.chatURL));
	if (links.length) {
		css += rule(links.map((link) => `${link} > div`).join(", "), text);
		css += rule(links.map((link) => `${link} :is(img, svg:has(image))`).join(", "), media);
	}
	return css;
}

// The same selector list with `suffix` (":hover", "::after") on each part.
function suffixed(selectorList, suffix) {
	return splitSelectorList(selectorList)
		.map((selector) => `${selector}${suffix}`)
		.join(", ");
}

// Splits "a, b:is(c, d)" at its top-level commas only.
function splitSelectorList(selectorList) {
	const parts = [];
	let depth = 0;
	let current = "";
	for (const char of selectorList) {
		if (char === "(" || char === "[") depth++;
		if (char === ")" || char === "]") depth--;
		if (char === "," && depth === 0) {
			parts.push(current.trim());
			current = "";
		} else {
			current += char;
		}
	}
	parts.push(current.trim());
	return parts;
}

// The declarations for one set of methods (text or media): { normal, hover, bar }. Blur and pixelate are both
// filters, so they share one declaration. The black bar ("redact") is solid, so dimming is skipped with it:
// for text it's a bar laid over the element (`bar`, drawn by ::after), for media the picture turns black.
function obfStyles(selected, { blurIntensity, brightnessIntensity }, kind) {
	const redact = selected.includes("redact");
	const filters = [];
	if (redact && kind === "media") {
		filters.push("brightness(0)");
	} else {
		if (selected.includes("blur")) filters.push(`blur(${blurIntensity}px)`);
		if (selected.includes("pixelate")) filters.push(PIXELATE_URL);
	}

	let normal = "";
	let hover = "";
	if (filters.length) {
		normal += `filter: ${filters.join(" ")} !important;`;
		hover += "filter: none !important;";
	}
	if (selected.includes("opacity") && !redact) {
		normal += `opacity: ${brightnessIntensity} !important;`;
		hover += "opacity: 1 !important;";
	}
	if (selected.includes("flip")) {
		normal += "transform: scaleX(-1) !important;";
		hover += "transform: none !important;";
	}
	const bar = redact && kind === "text";
	if (bar) normal += "position: relative !important;";
	return { normal, hover, bar };
}

// Fixed styles for the @ rules people can put in a message.
const AT_RULE_CSS =
	`div[data-obfpxl="true"] { ${PIXELATE_FILTER} } div[data-obfpxl="true"]:hover { filter: none !important; }` +
	'div[data-obfflp="true"] { transform: scaleX(-1) !important; } div[data-obfflp="true"]:hover { transform: scaleX(1) !important; }' +
	'div[data-obfblr="true"] { filter: blur(8px) !important; } div[data-obfblr="true"]:hover { filter: blur(0px) !important; }' +
	'div[data-obfdim="true"] { opacity: 0.1 !important; } div[data-obfdim="true"]:hover { opacity: 1 !important; }';

// Marks the log of every open chat that's set to obfuscate, and the parts of its area that show who it's with.
// Pop-ups are matched to stored chats by name.
function markOpenChats(chats) {
	const obfuscatedUrls = new Set(chats.filter((chat) => chat.isObfuscated).map((chat) => chat.chatURL));
	const obfuscatedNames = new Set(chats.filter((chat) => chat.isObfuscated).map((chat) => chat.chatName));
	const identity = new Map();

	Page.openChats().forEach(({ log, area, chatUrl, title }) => {
		const obfuscated = chatUrl ? obfuscatedUrls.has(chatUrl) : obfuscatedNames.has(title);
		setFlag(log, "data-hc-obfuscated", obfuscated);
		if (!obfuscated || !area) return;
		const { media, text } = Page.identityParts(area, log);
		media.forEach((element) => identity.set(element, "media"));
		text.forEach((element) => identity.set(element, "text"));
	});

	document.querySelectorAll("[data-hc-identity]").forEach((element) => {
		if (!identity.has(element)) element.removeAttribute("data-hc-identity");
	});
	identity.forEach((kind, element) => {
		if (element.getAttribute("data-hc-identity") !== kind) element.setAttribute("data-hc-identity", kind);
	});
}

// Marks messages that contain an @ rule (@pxl, @blr, @flp, @dim) so the matching style applies.
function markAtRules() {
	const rules = { "@pxl": "data-obfpxl", "@blr": "data-obfblr", "@flp": "data-obfflp", "@dim": "data-obfdim" };

	document.querySelectorAll(Parts.inside("messageRow", "messageText")).forEach((message) => {
		const text = message.textContent;
		for (const [rule, attribute] of Object.entries(rules)) {
			const on = text.includes(rule);
			if ((message.getAttribute(attribute) === "true") !== on) {
				if (on) message.setAttribute(attribute, "true");
				else message.removeAttribute(attribute);
			}
		}
	});
}
