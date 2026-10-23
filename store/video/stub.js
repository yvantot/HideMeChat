// Stand-in for the Chrome extension APIs, so the real popup and lock pages can play their part in the demo video
// with made-up chats. render.mjs puts it in front of every page under html/.
// Query options: ?shown (the page's hidden chats shown), ?locked (a password is set)
(() => {
	const params = new URLSearchParams(location.search);
	document.write("<style>*,*::before,*::after{animation:none!important;transition:none!important}</style>");
	const chat = (chatName, chatURL, flags) => ({ chatName, chatImg: "#", chatURL, lastMsg: "1h", dateAdded: "2026-10-22", isHidden: false, isLocked: false, isPinned: false, isObfuscated: false, ...flags });
	const data = {
		schemaVersion: 3,
		preferences: {
			obfMethod: { text: ["blur"], image: ["blur", "pixelate"], blurIntensity: 5, brightnessIntensity: 0.3 },
			pinnedColor: "#e2e5ff",
			userTheme: "light",
			layoutFixes: false,
			...(params.has("locked") ? { password: { salt: "AAAAAAAAAAAAAAAAAAAAAA==", hash: "AAAA", iterations: 1000 } } : {}),
		},
		// In the order they're flagged in the video.
		messengerChats: [
			chat("Sam's surprise party", "/t/102/", { isHidden: true }),
			chat("Mom", "/t/107/", { isPinned: true }),
			chat("Alex", "/t/101/", { isObfuscated: true }),
			chat("Gift shop", "/t/104/", { isLocked: true }),
		],
	};
	const clone = (v) => JSON.parse(JSON.stringify(v));
	const local = {
		get(keys, cb) {
			if (cb) return void setTimeout(() => cb(clone(data)));
			return Promise.resolve(clone(data));
		},
		set(obj, cb) {
			if (cb) return void setTimeout(cb);
			return Promise.resolve();
		},
		remove: () => Promise.resolve(),
		onChanged: { addListener() {} },
	};
	const session = {};
	window.chrome = {
		storage: {
			local,
			session: { get: async (k) => ({ [k]: session[k] }), set: async (o) => Object.assign(session, o) },
			onChanged: { addListener() {} },
		},
		runtime: {
			lastError: undefined,
			getURL: (p) => `/${p}`,
			getManifest: () => ({ version: "3.0.0" }),
			sendMessage: (msg, cb) => cb && setTimeout(() => cb(null)),
		},
		tabs: {
			query: (q, cb) => {
				const tabs = [{ id: 1, url: "https://www.messenger.com/t/101/" }];
				return cb ? setTimeout(() => cb(tabs)) : Promise.resolve(tabs);
			},
			sendMessage: (id, msg, cb) => {
				const answer = msg.message === "health" ? { ok: true, missing: [], showHiddenChats: params.has("shown"), parts: {}, log: [] } : null;
				if (cb) setTimeout(() => cb(answer));
			},
		},
	};
})();
