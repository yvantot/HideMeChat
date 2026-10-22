// Stand-in for the Chrome extension APIs, so the real popup and lock pages can be shown in store screenshots
// with made-up chats. render.py puts it in front of every page under html/.
// Query options: ?dark, ?still (no animations), ?settings (open the settings view), ?locked (a password is set)
(() => {
	const params = new URLSearchParams(location.search);
	document.write("<style>*,*::before,*::after{animation:none!important;transition:none!important}</style>");
	if (params.has("settings")) addEventListener("load", () => setTimeout(() => document.querySelector("[data-go=settings]")?.click(), 100));
	const chat = (chatName, chatURL, flags) => ({ chatName, chatImg: "#", chatURL, lastMsg: "1h", dateAdded: "2026-10-20", isHidden: false, isLocked: false, isPinned: false, isObfuscated: false, ...flags });
	let data = {
		schemaVersion: 3,
		preferences: {
			obfMethod: { text: ["blur"], image: ["blur", "pixelate"], blurIntensity: 5, brightnessIntensity: 0.3 },
			pinnedColor: "#3d4bd8",
			userTheme: params.has("dark") ? "dark" : "light",
			layoutFixes: false,
			...(params.has("locked") ? { password: { salt: "AAAAAAAAAAAAAAAAAAAAAA==", hash: "AAAA", iterations: 1000 } } : {}),
		},
		messengerChats: [
			chat("Mom", "/t/101/", { isPinned: true }),
			chat("Book club", "/t/102/", { isPinned: true }),
			chat("Alex Rivera", "/t/103/", { isObfuscated: true }),
			chat("Weekend trip", "/t/104/", { isLocked: true, isObfuscated: true }),
			chat("Design team", "/t/105/", { isHidden: true }),
		],
	};
	const listeners = [];
	const clone = (v) => JSON.parse(JSON.stringify(v));
	const local = {
		get(keys, cb) {
			const out = clone(data);
			if (cb) return void setTimeout(() => cb(out));
			return Promise.resolve(out);
		},
		set(obj, cb) {
			data = { ...data, ...clone(obj) };
			if (cb) return void setTimeout(cb);
			return Promise.resolve();
		},
		remove() {
			return Promise.resolve();
		},
		onChanged: { addListener: (f) => listeners.push(f) },
	};
	const session = {};
	window.chrome = {
		storage: {
			local,
			session: { get: async (k) => ({ [k]: session[k] }), set: async (o) => Object.assign(session, o) },
			onChanged: { addListener: (f) => listeners.push(f) },
		},
		runtime: {
			lastError: undefined,
			getURL: (p) => `/${p}`,
			getManifest: () => ({ version: "3.0.0" }),
			sendMessage: (msg, cb) => cb && setTimeout(() => cb(null)),
		},
		tabs: {
			query: (q, cb) => {
				const tabs = [{ id: 1, url: "https://www.messenger.com/t/103/" }];
				return cb ? setTimeout(() => cb(tabs)) : Promise.resolve(tabs);
			},
			sendMessage: (id, msg, cb) => {
				const answer = msg.message === "health" ? { ok: true, missing: [], showHiddenChats: false, parts: {}, log: [] } : null;
				if (cb) setTimeout(() => cb(answer));
			},
		},
	};
})();
