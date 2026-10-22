// Fixtures and loaders shared by the test files.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createWorld } = require("./world");

const ROOT = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const CONTENT_SCRIPTS = manifest.content_scripts[0].js.map((file) => file.replace(/^\.\//, ""));

const CLASSES = {
	CHATLIST: "x1n2onr6",
	CONVERSATION: "x78zum5 xdt5ytf x1iyjqo2 xs83m0k x1n2onr6",
	MESSAGELIST: "x78zum5 xdt5ytf x1iyjqo2 x2lah0s xl56j7k x121v3j4",
};

const settle = () => new Promise((resolve) => setImmediate(resolve));
async function settleAll(times = 6) {
	for (let i = 0; i < times; i++) await settle();
}
async function waitFor(condition, ms = 8000) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		if (condition()) return true;
		await new Promise((resolve) => setTimeout(resolve, 15));
	}
	return condition();
}
// Errors thrown, and errors the content scripts caught and kept for the report (see js/content/health.js).
const errors = (world) => [
	...world.log.filter((line) => /threw/.test(line)),
	...world.run("typeof healthLog === 'undefined' ? [] : healthLog.filter((e) => e.kind === 'error').map((e) => e.text)"),
];

// ---------- synthetic pages, shaped like the live ones (see fixtures/ for real captures) ----------

const chatHref = (site, id) =>
	`${site === "messenger" ? "" : "/messages"}${id.startsWith("e") ? `/e2ee/t/${id.slice(1)}/` : `/t/${id}/`}`;

function chatRows(site, ids, { twoHidden = false, noSeparator = [], prompt = false } = {}) {
	return ids
		.map((id) => {
			const label = prompt ? "Follow up?" : `${id}h`;
			const time = twoHidden ? `<span aria-hidden="true">${label}</span>` : `<span><span>${label}</span></span>`;
			const separator = noSeparator.includes(id) ? "" : `<span aria-hidden="true">·</span>${time}`;
			return (
				`<div data-virtualized="false"><div role="row"><div role="gridcell"><a role="link" href="${chatHref(site, id)}">` +
				`<div><img src="https://cdn.example/${id}.jpg"><div><span dir="auto"><span>Name ${id}</span></span>` +
				`<div class="preview"><span dir="auto"><span>Last ${id}</span>${separator}</span></div></div></div></a></div></div></div>`
			);
		})
		.join("");
}

const messages = (tag) =>
	`<div data-scope="messages_table"><div><div dir="auto">hello ${tag}</div></div></div>` +
	`<div data-scope="messages_table"><div><div dir="auto">secret @blr</div></div></div>` +
	`<div data-scope="messages_table"><div><div><img src="https://cdn.example/photo.jpg"></div></div></div>`;

// main > conversation > [column > log, info panel], like facebook.com/messages and messenger.com.
function messagesPage(site, ids, options = {}) {
	const { grid = true, virtualized = true, classes = true } = options;
	let rows = chatRows(site, ids, options);
	if (!virtualized) rows = rows.replace(/ data-virtualized="false"/g, "");
	return (
		`<div><div${grid ? ' role="grid"' : ""}><div><div${classes ? ` class="${CLASSES.CHATLIST}"` : ""}>${rows}</div></div></div></div>` +
		`<div role="main" style="width: 10px"><div class="${CLASSES.CONVERSATION}"><div class="column"><div role="log"><div><div role="none">` +
		`<div class="${CLASSES.MESSAGELIST}">${messages("main")}</div></div></div></div><div role="textbox"></div></div>` +
		`<div class="panel"><div role="region">info</div></div></div></div>`
	);
}

// A chat pop-up, like the live ones: the header has the avatar, the title h2 and a close button, and the
// message area has a hidden h2 of its own next to the log.
const popup = (title, tag = "popup") =>
	`<div class="window"><div class="header"><div role="button" class="popup-avatar"><img src="https://cdn.example/popup-avatar.jpg"></div>` +
	`<div role="button" class="popup-title"><h2><span><span>${title}</span></span></h2></div><div role="button" aria-label="Close chat"><svg></svg></div></div>` +
	`<div data-mw-file-dropzone="1"><div><h2>Messages</h2><div role="log"><div class="${CLASSES.MESSAGELIST}">${messages(tag)}</div></div></div><div role="textbox"></div></div></div>`;

function facebookHome({ dropdown = false, popups = [], mainGrid = false } = {}) {
	return (
		`<div class="feed"><h2>Stories</h2><div class="${CLASSES.CHATLIST}"><a href="/stories/1">story</a></div></div>` +
		(mainGrid ? `<div role="grid" id="main-grid"><div class="${CLASSES.CHATLIST}">${chatRows("fb", ["1", "2"])}</div></div>` : "") +
		(dropdown
			? `<div role="dialog"><div role="grid" id="dropdown"><div class="${CLASSES.CHATLIST}">${chatRows("fb", ["1", "2", "3"])}</div></div></div>`
			: "") +
		`<div class="chat-tabs">${popups.map((title) => popup(title)).join("")}</div>`
	);
}

// ---------- stored data ----------

const chat = (id, flags = {}) => ({
	chatName: `Name ${id}`,
	chatImg: "#",
	chatURL: id.startsWith("e") ? `/e2ee/t/${id.slice(1)}/` : `/t/${id}/`,
	lastMsg: "#",
	dateAdded: "2026-01-02",
	isHidden: false,
	isLocked: false,
	isPinned: false,
	isObfuscated: false,
	...flags,
});

const prefs = (extra = {}) => ({
	obfMethod: { text: ["opacity", "flip"], image: ["blur", "pixelate"], blurIntensity: 5, brightnessIntensity: 0.3 },
	pinnedColor: "#162184",
	userTheme: "light",
	...extra,
});

const stored = (chats = [], extra = {}) => ({ schemaVersion: 3, preferences: prefs(extra), messengerChats: chats });

// ---------- worlds ----------

function contentWorld(url, body, data = stored()) {
	const world = createWorld({ root: ROOT, files: [], href: url, state: data });
	world.doc.body.innerHTML = body;
	for (const file of CONTENT_SCRIPTS) world.run(read(file));
	return world;
}

// An extension page (popup, setting, lock) with the scripts its HTML loads.
function pageWorld(page, url, data, { session = {}, tabs, responses = {} } = {}) {
	const html = read(`html/${page}.html`);
	const world = createWorld({ root: ROOT, files: [], href: url, state: data, html });
	Object.assign(world.session, session);
	if (tabs) world.tabs = tabs;
	Object.assign(world.tabResponses, { health: { ok: true, missing: [], showHiddenChats: false } }, responses);
	for (const [, file] of html.matchAll(/<script src="\.\.\/([^"]+)"/g)) world.run(read(file));
	return world;
}

function backgroundWorld(data) {
	return createWorld({
		root: ROOT,
		files: ["js/background/handleData.js"],
		href: "https://www.facebook.com/messages/",
		state: data,
	});
}

// ---------- the shared password code, run on its own ----------

const passwordContext = vm.createContext({ crypto: globalThis.crypto, TextEncoder, btoa, atob, Uint8Array });
vm.runInContext(read("js/shared/password.js"), passwordContext);
const hashPassword = (password) => vm.runInContext(`hashPassword(${JSON.stringify(password)})`, passwordContext);
function verifyPassword(password, record) {
	passwordContext.record = record;
	return vm.runInContext(`verifyPassword(${JSON.stringify(password)}, record)`, passwordContext);
}

module.exports = {
	ROOT,
	read,
	manifest,
	CLASSES,
	settle,
	settleAll,
	waitFor,
	errors,
	chatHref,
	chatRows,
	messages,
	messagesPage,
	popup,
	facebookHome,
	chat,
	prefs,
	stored,
	contentWorld,
	pageWorld,
	backgroundWorld,
	hashPassword,
	verifyPassword,
};
