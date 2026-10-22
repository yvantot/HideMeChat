// Runs a set of extension scripts in a vm context with fake Chrome APIs, timers, dialogs and DOM, and records
// every observable side effect in `log`.
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { Document, Element, parseInto, snapshot, pathOf } = require("./dom");

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

class Clock {
	constructor(log) {
		this.now = 0;
		this.timers = new Map();
		this.nextId = 1;
		this.log = log;
	}
	add(fn, ms, interval) {
		const id = this.nextId++;
		ms = Number(ms) || 0;
		this.timers.set(id, { fn, due: this.now + ms, interval: interval ? ms : null });
		this.log(`${interval ? "setInterval" : "setTimeout"} ${ms} -> #${id}`);
		return id;
	}
	clear(id) {
		if (this.timers.has(id)) this.log(`clear #${id}`);
		this.timers.delete(id);
	}
	advance(ms) {
		const end = this.now + ms;
		for (let guard = 0; guard < 100000; guard++) {
			let next = null;
			for (const [id, t] of this.timers) {
				if (t.due > end) continue;
				if (!next || t.due < next[1].due || (t.due === next[1].due && id < next[0])) next = [id, t];
			}
			if (!next) break;
			const [id, t] = next;
			this.now = t.due;
			if (t.interval !== null) t.due += Math.max(t.interval, 1);
			else this.timers.delete(id);
			try {
				t.fn();
			} catch (e) {
				this.log(`timer #${id} threw ${e.constructor.name}: ${e.message}`);
			}
		}
		this.now = end;
	}
}

function loadHtml(doc, html) {
	const holder = new Element(doc, "div");
	parseInto(doc, holder, html);
	const root = [...holder.children].find((el) => el.tagName === "HTML");
	doc.documentElement = root;
	root.parentNode = doc;
	doc.head = [...root.children].find((el) => el.tagName === "HEAD");
	doc.body = [...root.children].find((el) => el.tagName === "BODY");
}

function createWorld({ root, files, href, state, html }) {
	const log = [];
	const L = (s) => log.push(s);
	const clock = new Clock(L);
	const location = {
		href,
		get origin() {
			return new URL(this.href).origin;
		},
		get pathname() {
			return new URL(this.href).pathname;
		},
		get search() {
			return new URL(this.href).search;
		},
	};
	const doc = new Document(location);
	doc.log = L;
	if (html) loadHtml(doc, html);

	const world = {
		log,
		clock,
		doc,
		location,
		storage: clone(state),
		prompts: [],
		confirms: [],
		tabs: [{ id: 7, url: href }],
		tabResponses: {},
		runtimeResponse: undefined,
		// Answers to runtime.sendMessage by message name, before runtimeResponse.
		runtimeResponses: {},
		// What fetch() gets: { status, body } or { error } for a network failure.
		fetchResult: { error: "Failed to fetch" },
		fetched: [],
		clipboard: null,
		observers: [],
		listeners: { storageChanged: [], localChanged: [], runtimeMessage: [], installed: [], menuClicked: [] },
		session: {},
		localStorage: new Map(),
		windowListeners: {},
		posted: [],
	};
	world.fireWindow = (type, event) => (world.windowListeners[type] ?? []).forEach((fn) => fn({ type, ...event }));

	const chrome = {
		// Like Chrome's, each storage call takes a callback or returns a promise.
		storage: {
			local: {
				get(keys, cb) {
					if (cb) cb(clone(world.storage));
					else return Promise.resolve(clone(world.storage));
				},
				set(obj, cb) {
					L(`storage.set ${JSON.stringify(obj)}`);
					world.storage = { ...world.storage, ...clone(obj) };
					if (cb) cb();
					else return Promise.resolve();
				},
				remove(keys, cb) {
					L(`storage.remove ${JSON.stringify(keys)}`);
					[].concat(keys).forEach((key) => delete world.storage[key]);
					if (cb) cb();
					else return Promise.resolve();
				},
				clear() {
					L("storage.clear");
					world.storage = {};
					return Promise.resolve();
				},
				onChanged: { addListener: (f) => world.listeners.localChanged.push(f) },
			},
			session: {
				async get(key) {
					return { [key]: world.session[key] };
				},
				async set(obj) {
					L(`session.set ${Object.keys(obj).join()}`);
					Object.assign(world.session, obj);
				},
			},
			onChanged: { addListener: (f) => world.listeners.storageChanged.push(f) },
		},
		runtime: {
			getURL: (p) => `chrome-extension://fakeid/${p}`,
			getManifest: () => JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")),
			onMessage: { addListener: (f) => world.listeners.runtimeMessage.push(f) },
			onInstalled: { addListener: (f) => world.listeners.installed.push(f) },
			sendMessage(msg, cb) {
				L(`runtime.sendMessage ${JSON.stringify(msg)}`);
				const answer = msg.message in world.runtimeResponses ? world.runtimeResponses[msg.message] : world.runtimeResponse;
				if (cb) cb(clone(answer));
			},
		},
		contextMenus: {
			create: (o) => L(`contextMenus.create ${JSON.stringify(o)}`),
			removeAll(cb) {
				L("contextMenus.removeAll");
				if (cb) cb();
			},
			onClicked: { addListener: (f) => world.listeners.menuClicked.push(f) },
		},
		tabs: {
			query(q, cb) {
				L(`tabs.query ${JSON.stringify(q)}`);
				if (cb) cb(clone(world.tabs));
				else return Promise.resolve(clone(world.tabs));
			},
			sendMessage(id, msg, ...rest) {
				L(`tabs.sendMessage ${id} ${JSON.stringify(msg)} extraArgs=${rest.map((r) => typeof r).join(",")}`);
				const cb = rest.find((r) => typeof r === "function");
				if (cb) cb(clone(world.tabResponses[msg.message]));
			},
		},
	};

	class MutationObserver {
		constructor(cb) {
			this.cb = cb;
			world.observers.push(this);
			L("new MutationObserver");
		}
		observe(target, options) {
			L(`observe ${pathOf(target)} ${JSON.stringify(options)}`);
			this.target = target;
		}
		disconnect() {
			L("disconnect");
			this.target = null;
		}
	}

	class Blob {
		constructor(parts, options) {
			L(`Blob ${JSON.stringify(parts)} ${options?.type}`);
			(world.blobs ??= []).push(parts.join(""));
		}
	}
	class FakeURL extends URL {
		static createObjectURL() {
			L("createObjectURL");
			return "blob:fake/1";
		}
		static revokeObjectURL(x) {
			L(`revokeObjectURL ${typeof x === "string" ? x : "[non-string]"}`);
		}
	}
	class FileReader {
		readAsText(file) {
			L("readAsText");
			clock.add(() => {
				if (file.fail) this.onerror?.();
				else this.onload?.({ target: { result: file.text } });
			}, 0);
		}
	}

	const sandbox = {
		chrome,
		document: doc,
		location,
		MutationObserver,
		Blob,
		URL: FakeURL,
		FileReader,
		btoa: (s) => {
			if (/[^\u0000-ÿ]/.test(s)) throw new Error("InvalidCharacterError");
			return Buffer.from(s, "latin1").toString("base64");
		},
		atob: (s) => {
			if (!/^[A-Za-z0-9+/=\s]*$/.test(s)) throw new Error("InvalidCharacterError");
			return Buffer.from(s, "base64").toString("latin1");
		},
		setTimeout: (fn, ms) => clock.add(fn, ms, false),
		setInterval: (fn, ms) => clock.add(fn, ms, true),
		clearTimeout: (id) => clock.clear(id),
		clearInterval: (id) => clock.clear(id),
		prompt(msg) {
			L(`prompt ${msg}`);
			if (!world.prompts.length) throw new Error("PROMPT_QUEUE_EMPTY");
			return world.prompts.shift();
		},
		alert: (msg) => L(`alert ${msg}`),
		TextEncoder,
		TextDecoder,
		crypto: globalThis.crypto,
		URLSearchParams,
		localStorage: {
			getItem: (key) => world.localStorage.get(key) ?? null,
			setItem: (key, value) => world.localStorage.set(key, String(value)),
			removeItem: (key) => world.localStorage.delete(key),
		},
		// window events (message, focus) and the parent window a frame posts to
		addEventListener: (type, fn) => (world.windowListeners[type] ??= []).push(fn),
		parent: {
			postMessage(message, origin) {
				L(`parent.postMessage ${JSON.stringify(message)} ${origin}`);
				world.posted.push(message);
			},
		},
		fetch: async (url, options = {}) => {
			const { signal, ...rest } = options;
			L(`fetch ${url} ${JSON.stringify(rest)}`);
			world.fetched.push({ url, options: rest });
			const result = world.fetchResult;
			if (result.error) throw new TypeError(result.error);
			return { ok: result.status >= 200 && result.status < 300, status: result.status, text: async () => result.body };
		},
		AbortController,
		navigator: {
			userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
			clipboard: {
				async writeText(text) {
					L("clipboard.writeText");
					world.clipboard = text;
				},
			},
		},
		confirm(msg) {
			L(`confirm ${msg}`);
			return world.confirms.shift() ?? false;
		},
		console,
	};
	sandbox.window = sandbox;
	sandbox.importScripts = (...files) =>
		files.forEach((file) => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx, { filename: file }));
	const ctx = vm.createContext(sandbox);

	for (const file of files) {
		const code = fs.readFileSync(path.join(root, file), "utf8");
		try {
			vm.runInContext(code, ctx, { filename: file });
		} catch (e) {
			L(`load ${file} threw ${e.constructor.name}: ${e.message}`);
		}
	}

	world.ctx = ctx;
	world.run = (code) => vm.runInContext(code, ctx);
	world.step = (name, fn) => {
		L(`--- ${name}`);
		try {
			const result = fn();
			if (result !== undefined) L(`result ${JSON.stringify(result)}`);
		} catch (e) {
			L(`threw ${e.constructor.name}: ${e.message}`);
		}
	};
	world.snap = (label) => L(`snapshot ${label}: ${snapshot(doc.documentElement)}`);
	world.snapStorage = (label) => L(`storage ${label}: ${JSON.stringify(world.storage)}`);
	world.fireObservers = () =>
		world.observers.filter((o) => o.target).forEach((o) => {
			try {
				o.cb([]);
			} catch (e) {
				L(`observer threw ${e.constructor.name}: ${e.message}`);
			}
		});
	world.message = (request) => {
		world.listeners.runtimeMessage.forEach((listener) => {
			let responded = false;
			const ret = listener(request, {}, (response) => {
				responded = true;
				L(`sendResponse ${JSON.stringify(response)}`);
			});
			L(`listener returned ${ret} responded=${responded}`);
		});
	};
	return world;
}

module.exports = { createWorld, clone };
