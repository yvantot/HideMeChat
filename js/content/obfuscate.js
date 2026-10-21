const PIXELATE_FILTER =
	"filter: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='b' x='0' y='0'%3E%3CfeFlood x='4' y='4' height='2' width='2'/%3E%3CfeComposite width='10' height='10'/%3E%3CfeTile result='a'/%3E%3CfeComposite in='SourceGraphic' in2='a' operator='in'/%3E%3CfeMorphology operator='dilate' radius='5'/%3E%3C/filter%3E%3C/svg%3E#b\") !important;";

// Message parts that get the text or media style. Media is styled through the element wrapping it.
const OBF_TEXT = `${SELECTORS.MESSAGEROW} :is(${SELECTORS.TEXT}, ${SELECTORS.STICKERS}, ${SELECTORS.REPLYTEXT})`;
const OBF_MEDIA = `${SELECTORS.MESSAGEROW} :is(div:has(> img), div:has(> video), div:has(> a > img))`;

// Stylesheet for obfuscated chats: the messages of open chats whose log is marked data-hc-obfuscated
// (see markOpenChats), and the rows of obfuscated chats in the chat lists.
function obfuscationCSS(chats, obfMethod) {
	const text = obfStyles(obfMethod.text, obfMethod.blurIntensity, obfMethod.brightnessIntensity);
	const media = obfStyles(obfMethod.image, obfMethod.blurIntensity, obfMethod.brightnessIntensity);

	let css =
		`[data-hc-obfuscated] ${OBF_TEXT} { ${text.normal} } [data-hc-obfuscated] ${OBF_TEXT}:hover { ${text.hover} } ` +
		`[data-hc-obfuscated] ${OBF_MEDIA} { ${media.normal} } [data-hc-obfuscated] ${OBF_MEDIA}:hover { ${media.hover} } `;

	const rows = chats
		.filter((chat) => chat.isObfuscated)
		.flatMap((chat) => Page.chatLinkSelector(chat.chatURL).split(", "))
		.map((link) => `${link} > div`);
	if (rows.length) {
		const selector = rows.join(", ");
		const hover = rows.map((row) => `${row}:hover`).join(", ");
		css += `${selector} { ${text.normal} } ${hover} { ${text.hover} } `;
	}
	return css;
}

// The declarations for one set of methods: { normal, hover }. Blur and pixelate both set `filter`, so when both
// are picked they're merged into one declaration.
function obfStyles(selected, blurIntensity, brightnessIntensity) {
	// Each method: [style while obfuscated, style on hover].
	const methods = {
		blur: [`filter: blur(${blurIntensity}px) !important;`, "filter: none !important;"],
		opacity: [`opacity: ${brightnessIntensity} !important;`, "opacity: 1 !important;"],
		flip: ["transform: scaleX(-1) !important;", "transform: none !important;"],
		pixelate: [PIXELATE_FILTER, "filter: none !important;"],
	};

	const combined = selected.includes("blur") && selected.includes("pixelate");
	let normal = "";
	let hover = "";
	selected.forEach((method) => {
		if (!Object.hasOwn(methods, method)) return;
		if (combined && (method === "blur" || method === "pixelate")) return;
		normal += methods[method][0];
		hover += methods[method][1];
	});
	if (combined) {
		normal += `${methods.blur[0].replace(" !important;", "")} ${methods.pixelate[0].replace("filter: ", "")}`;
		hover += methods.blur[1];
	}
	return { normal, hover };
}

// Fixed styles for the @ rules people can put in a message.
const AT_RULE_CSS =
	`div[data-obfpxl="true"] { ${PIXELATE_FILTER} } div[data-obfpxl="true"]:hover { filter: none !important; }` +
	'div[data-obfflp="true"] { transform: scaleX(-1) !important; } div[data-obfflp="true"]:hover { transform: scaleX(1) !important; }' +
	'div[data-obfblr="true"] { filter: blur(8px) !important; } div[data-obfblr="true"]:hover { filter: blur(0px) !important; }' +
	'div[data-obfdim="true"] { opacity: 0.1 !important; } div[data-obfdim="true"]:hover { opacity: 1 !important; }';

// Marks the log of every open chat that's set to obfuscate. Pop-ups are matched to stored chats by name.
function markOpenChats(chats) {
	const obfuscatedUrls = new Set(chats.filter((chat) => chat.isObfuscated).map((chat) => chat.chatURL));
	const obfuscatedNames = new Set(chats.filter((chat) => chat.isObfuscated).map((chat) => chat.chatName));

	Page.openChats().forEach(({ log, chatUrl, title }) => {
		const obfuscated = chatUrl ? obfuscatedUrls.has(chatUrl) : obfuscatedNames.has(title);
		setFlag(log, "data-hc-obfuscated", obfuscated);
	});
}

// Marks messages that contain an @ rule (@pxl, @blr, @flp, @dim) so the matching style applies.
function markAtRules() {
	const rules = { "@pxl": "data-obfpxl", "@blr": "data-obfblr", "@flp": "data-obfflp", "@dim": "data-obfdim" };

	document.querySelectorAll(`${SELECTORS.MESSAGEROW} ${SELECTORS.TEXT}`).forEach((message) => {
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
