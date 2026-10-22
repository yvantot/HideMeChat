// A small fake DOM: enough of the API, selector syntax and HTML parsing for HideMeChat's scripts.
const VOID = new Set(["meta", "link", "img", "input", "br", "hr", "path", "source"]);
const RAW = new Set(["style", "script"]);

class Text {
	constructor(text) {
		this.nodeType = 3;
		this.data = text;
		this.parentNode = null;
	}
	get textContent() {
		return this.data;
	}
}

class Element {
	constructor(doc, tag) {
		this.nodeType = 1;
		this.ownerDocument = doc;
		this.tagName = tag.toUpperCase();
		this.attributes_ = new Map();
		this.childNodes = [];
		this.parentNode = null;
		this.listeners = [];
		this.checked = false;
		this.value_ = "";
		this.files = [];
	}
	get parentElement() {
		return this.parentNode instanceof Element ? this.parentNode : null;
	}
	get children() {
		const self = this;
		const list = () => self.childNodes.filter((n) => n instanceof Element);
		return new Proxy(
			{},
			{
				get(_, prop) {
					const items = list();
					if (prop === "length") return items.length;
					if (typeof prop === "string" && /^\d+$/.test(prop)) return items[Number(prop)];
					if (prop === Symbol.iterator) return items[Symbol.iterator].bind(items);
					return undefined;
				},
			}
		);
	}
	get firstChild() {
		return this.childNodes[0] ?? null;
	}
	get nextSibling() {
		if (!this.parentNode) return null;
		const siblings = this.parentNode.childNodes;
		return siblings[siblings.indexOf(this) + 1] ?? null;
	}
	get id() {
		return this.getAttribute("id") ?? "";
	}
	get value() {
		return this.value_;
	}
	set value(v) {
		this.value_ = String(v);
	}
	get href() {
		const raw = this.getAttribute("href");
		if (raw === null) return "";
		return new URL(raw, this.ownerDocument.location.href).href;
	}
	set href(v) {
		this.setAttribute("href", v);
	}
	get src() {
		const raw = this.getAttribute("src");
		if (raw === null) return "";
		return new URL(raw, this.ownerDocument.location.href).href;
	}
	set download(v) {
		this.setAttribute("download", v);
	}
	get textContent() {
		return this.childNodes.map((n) => n.textContent).join("");
	}
	set textContent(v) {
		this.childNodes.forEach((n) => (n.parentNode = null));
		this.childNodes = [];
		this.appendChild(new Text(String(v)));
	}
	get innerText() {
		return this.textContent;
	}
	set innerText(v) {
		this.textContent = v;
	}
	get innerHTML() {
		return this.childNodes.map((n) => serializeRaw(n)).join("");
	}
	set innerHTML(html) {
		this.childNodes.forEach((n) => (n.parentNode = null));
		this.childNodes = [];
		html = String(html);
		if (RAW.has(this.tagName.toLowerCase())) {
			if (html) this.appendChild(new Text(html));
			return;
		}
		parseInto(this.ownerDocument, this, html);
	}
	get classList() {
		const el = this;
		const get = () => (el.getAttribute("class") || "").split(/\s+/).filter(Boolean);
		return {
			toggle(name) {
				const list = get();
				const i = list.indexOf(name);
				if (i === -1) list.push(name);
				else list.splice(i, 1);
				el.setAttribute("class", list.join(" "));
				return i === -1;
			},
			contains: (name) => get().includes(name),
			add: (name) => {
				if (!get().includes(name)) el.setAttribute("class", [...get(), name].join(" "));
			},
			remove: (name) => el.setAttribute("class", get().filter((c) => c !== name).join(" ")),
		};
	}
	setAttribute(name, value) {
		this.attributes_.set(name.toLowerCase(), String(value));
	}
	getAttribute(name) {
		const v = this.attributes_.get(name.toLowerCase());
		return v === undefined ? null : v;
	}
	hasAttribute(name) {
		return this.attributes_.has(name.toLowerCase());
	}
	removeAttribute(name) {
		this.attributes_.delete(name.toLowerCase());
	}
	appendChild(node) {
		if (node.parentNode) node.parentNode.removeChild(node);
		node.parentNode = this;
		this.childNodes.push(node);
		return node;
	}
	append(...nodes) {
		nodes.forEach((n) => this.appendChild(typeof n === "string" ? new Text(n) : n));
	}
	removeChild(node) {
		const i = this.childNodes.indexOf(node);
		if (i !== -1) this.childNodes.splice(i, 1);
		node.parentNode = null;
		return node;
	}
	insertBefore(node, ref) {
		if (ref === node) ref = node.nextSibling;
		if (node.parentNode) node.parentNode.removeChild(node);
		node.parentNode = this;
		const i = ref ? this.childNodes.indexOf(ref) : -1;
		if (i === -1) this.childNodes.push(node);
		else this.childNodes.splice(i, 0, node);
		return node;
	}
	remove() {
		if (this.parentNode) this.parentNode.removeChild(this);
	}
	contains(node) {
		for (let n = node; n; n = n.parentNode) if (n === this) return true;
		return false;
	}
	descendants() {
		const out = [];
		const walk = (el) => {
			for (const c of el.childNodes) {
				if (c instanceof Element) {
					out.push(c);
					walk(c);
				}
			}
		};
		walk(this);
		return out;
	}
	querySelectorAll(selector) {
		const groups = parseSelector(selector);
		const found = this.descendants().filter((el) => groups.some((g) => matchComplex(el, g)));
		found.item = (i) => found[i];
		return found;
	}
	querySelector(selector) {
		return this.querySelectorAll(selector)[0] ?? null;
	}
	closest(selector) {
		const groups = parseSelector(selector);
		for (let el = this; el instanceof Element; el = el.parentNode) {
			if (groups.some((g) => matchComplex(el, g))) return el;
		}
		return null;
	}
	matches(selector) {
		return parseSelector(selector).some((g) => matchComplex(this, g));
	}
	addEventListener(type, fn) {
		this.listeners.push({ type, fn });
	}
	// Returns a promise for whatever the (possibly async) listeners return.
	dispatch(type, event = {}) {
		const e = { type, target: this, preventDefault() {}, ...event };
		return Promise.all(this.listeners.filter((l) => l.type === type).map((l) => l.fn(e)));
	}
	get disabled() {
		return this.hasAttribute("disabled");
	}
	set disabled(on) {
		if (on) this.setAttribute("disabled", "");
		else this.removeAttribute("disabled");
	}
	get hidden() {
		return this.hasAttribute("hidden");
	}
	set hidden(on) {
		if (on) this.setAttribute("hidden", "");
		else this.removeAttribute("hidden");
	}
	// Each frame element gets its own stand-in window object, like a real iframe.
	get contentWindow() {
		if (this.tagName !== "IFRAME") return undefined;
		return (this.frameWindow ??= { frameOf: this.getAttribute("src") });
	}
	// No layout engine: tests set `box` ({ left, top, width, height }) on the elements whose geometry matters.
	getBoundingClientRect() {
		const { left = 0, top = 0, width = 0, height = 0 } = this.box ?? {};
		return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height };
	}
	get previousElementSibling() {
		if (!this.parentNode) return null;
		const siblings = this.parentNode.childNodes.filter((n) => n instanceof Element);
		return siblings[siblings.indexOf(this) - 1] ?? null;
	}
	focus() {
		this.ownerDocument.log?.(`focus ${pathOf(this)}`);
	}
	click() {
		this.ownerDocument.log?.(`click ${this.tagName} ${[...this.attributes_].map(([k, v]) => `${k}=${v}`).join(" ")}`);
		this.dispatch("click");
	}
}

class Document {
	constructor(location) {
		this.location = location;
		this.documentElement = new Element(this, "html");
		this.head = new Element(this, "head");
		this.body = new Element(this, "body");
		this.documentElement.appendChild(this.head);
		this.documentElement.appendChild(this.body);
		this.documentElement.parentNode = this;
	}
	createElement(tag) {
		return new Element(this, tag);
	}
	getElementById(id) {
		return this.documentElement.descendants().find((el) => el.getAttribute("id") === id) ?? null;
	}
	querySelectorAll(selector) {
		const groups = parseSelector(selector);
		const all = [this.documentElement, ...this.documentElement.descendants()];
		return all.filter((el) => groups.some((g) => matchComplex(el, g)));
	}
	querySelector(selector) {
		return this.querySelectorAll(selector)[0] ?? null;
	}
}

// --- selectors: tag, #id, .class, [attr], [attr='v'], [attr="v"], :is(), :not(), :has(), descendant and child
// combinators, lists ---
function splitTopLevel(text, sep) {
	const parts = [];
	let depth = 0;
	let quote = null;
	let current = "";
	for (const ch of text) {
		if (quote) {
			if (ch === quote) quote = null;
		} else if (ch === "'" || ch === '"') quote = ch;
		else if (ch === "[" || ch === "(") depth++;
		else if (ch === "]" || ch === ")") depth--;
		else if (ch === sep && depth === 0) {
			parts.push(current);
			current = "";
			continue;
		}
		current += ch;
	}
	parts.push(current);
	return parts;
}

function parseSelector(selector) {
	return splitTopLevel(selector, ",").map((part) => parseComplex(part.trim()));
}

function parseComplex(text) {
	const steps = [];
	let i = 0;
	let combinator = null;
	while (i < text.length) {
		const ch = text[i];
		if (/\s/.test(ch)) {
			if (combinator === null && steps.length) combinator = " ";
			i++;
			continue;
		}
		if (ch === ">") {
			combinator = ">";
			i++;
			continue;
		}
		const start = i;
		let quote = null;
		let depth = 0;
		while (i < text.length) {
			const c = text[i];
			if (quote) {
				if (c === quote) quote = null;
			} else if (c === "'" || c === '"') quote = c;
			else if (c === "[" || c === "(") depth++;
			else if (c === "]" || c === ")") depth--;
			else if (depth === 0 && (/\s/.test(c) || c === ">")) break;
			i++;
		}
		steps.push({ combinator: steps.length ? combinator ?? " " : null, compound: parseCompound(text.slice(start, i)) });
		combinator = null;
	}
	return steps;
}

function parseCompound(text) {
	const compound = { tag: null, attrs: [], ids: [], classes: [], pseudos: [] };
	const re = /^([a-zA-Z*][a-zA-Z0-9-]*)?/;
	const tag = text.match(re)[1];
	if (tag && tag !== "*") compound.tag = tag.toUpperCase();
	let rest = text.slice(tag ? tag.length : 0);
	while (rest.length) {
		let m;
		if ((m = rest.match(/^\[([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:([*^$]?=)\s*(?:'([^']*)'|"([^"]*)"|([^\]\s]+)))?\s*\]/))) {
			compound.attrs.push({ name: m[1].toLowerCase(), op: m[2], value: m[3] ?? m[4] ?? m[5] });
		} else if ((m = rest.match(/^#([-\w]+)/))) {
			compound.ids.push(m[1]);
		} else if ((m = rest.match(/^\.([-\w]+)/))) {
			compound.classes.push(m[1]);
		} else if ((m = rest.match(/^:(is|not|has)\(/))) {
			const close = closingParen(rest, m[0].length - 1);
			const arg = rest.slice(m[0].length, close);
			compound.pseudos.push(m[1] === "has" ? { name: "has", relatives: parseRelatives(arg) } : { name: m[1], groups: parseSelector(arg) });
			rest = rest.slice(close + 1);
			continue;
		} else {
			throw new Error(`Unsupported selector part: ${rest}`);
		}
		rest = rest.slice(m[0].length);
	}
	return compound;
}

// The index of the ")" closing the "(" at `open`.
function closingParen(text, open) {
	let depth = 0;
	let quote = null;
	for (let i = open; i < text.length; i++) {
		const c = text[i];
		if (quote) {
			if (c === quote) quote = null;
		} else if (c === "'" || c === '"') quote = c;
		else if (c === "(") depth++;
		else if (c === ")" && --depth === 0) return i;
	}
	throw new Error(`Unclosed parenthesis in: ${text}`);
}

// The relative selectors in :has(), such as "> img" or "a b": { child, steps }.
function parseRelatives(text) {
	return splitTopLevel(text, ",").map((part) => {
		const trimmed = part.trim();
		const child = trimmed.startsWith(">");
		return { child, steps: parseComplex(child ? trimmed.slice(1).trim() : trimmed) };
	});
}

function matchPseudo(el, pseudo) {
	if (pseudo.name === "is") return pseudo.groups.some((g) => matchComplex(el, g));
	if (pseudo.name === "not") return !pseudo.groups.some((g) => matchComplex(el, g));
	// :has(): some element below matches the relative selector, starting from `el` itself.
	return pseudo.relatives.some(({ child, steps }) => {
		const anchored = [{ combinator: null, compound: { anchor: el } }, { ...steps[0], combinator: child ? ">" : " " }, ...steps.slice(1)];
		return el.descendants().some((d) => matchComplex(d, anchored));
	});
}

function matchCompound(el, c) {
	if (c.anchor) return el === c.anchor;
	if (!(el instanceof Element)) return false;
	if (c.tag && el.tagName !== c.tag) return false;
	for (const a of c.attrs) {
		const v = el.getAttribute(a.name);
		if (v === null) return false;
		if (a.value === undefined) continue;
		if (a.op === "*=" && !v.includes(a.value)) return false;
		if (a.op === "^=" && !v.startsWith(a.value)) return false;
		if (a.op === "$=" && !v.endsWith(a.value)) return false;
		if (a.op === "=" && v !== a.value) return false;
	}
	for (const id of c.ids) if (el.getAttribute("id") !== id) return false;
	const classes = (el.getAttribute("class") || "").split(/\s+/);
	for (const cls of c.classes) if (!classes.includes(cls)) return false;
	for (const pseudo of c.pseudos) if (!matchPseudo(el, pseudo)) return false;
	return true;
}

function matchComplex(el, steps, index = steps.length - 1) {
	if (!matchCompound(el, steps[index].compound)) return false;
	if (index === 0) return true;
	const combinator = steps[index].combinator;
	if (combinator === ">") {
		const parent = el.parentElement;
		return !!parent && matchComplex(parent, steps, index - 1);
	}
	for (let p = el.parentElement; p; p = p.parentElement) {
		if (matchComplex(p, steps, index - 1)) return true;
	}
	return false;
}

// --- HTML parsing (tags, attributes, text; raw <style>/<script>) ---
function decodeEntities(text) {
	return text
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}

function parseAttributes(el, text) {
	const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
	let m;
	while ((m = re.exec(text))) {
		const value = m[2] ?? m[3] ?? m[4] ?? "";
		el.setAttribute(m[1], decodeEntities(value));
	}
}

function parseInto(doc, parent, html) {
	const stack = [parent];
	let i = 0;
	while (i < html.length) {
		const top = stack[stack.length - 1];
		if (html.startsWith("<!", i)) {
			i = html.indexOf(">", i) + 1;
		} else if (html.startsWith("</", i)) {
			const end = html.indexOf(">", i);
			const name = html.slice(i + 2, end).trim().toUpperCase();
			while (stack.length > 1) {
				const el = stack.pop();
				if (el.tagName === name) break;
			}
			i = end + 1;
		} else if (html[i] === "<") {
			let j = i + 1;
			let quote = null;
			while (j < html.length) {
				const c = html[j];
				if (quote) {
					if (c === quote) quote = null;
				} else if (c === '"' || c === "'") quote = c;
				else if (c === ">") break;
				j++;
			}
			const inner = html.slice(i + 1, j);
			const name = inner.match(/^[a-zA-Z0-9-]+/)[0];
			const el = doc.createElement(name);
			parseAttributes(el, inner.slice(name.length).replace(/\/$/, ""));
			top.appendChild(el);
			i = j + 1;
			const lower = name.toLowerCase();
			if (RAW.has(lower)) {
				const close = html.indexOf(`</${lower}>`, i);
				const raw = html.slice(i, close);
				if (raw) el.appendChild(new Text(raw));
				i = close + lower.length + 3;
			} else if (!VOID.has(lower) && !inner.endsWith("/")) {
				stack.push(el);
			}
		} else {
			let end = html.indexOf("<", i);
			if (end === -1) end = html.length;
			top.appendChild(new Text(decodeEntities(html.slice(i, end))));
			i = end;
		}
	}
}

function serializeRaw(node) {
	if (node instanceof Text) return node.data;
	const attrs = [...node.attributes_].map(([k, v]) => ` ${k}="${v}"`).join("");
	const tag = node.tagName.toLowerCase();
	if (VOID.has(tag)) return `<${tag}${attrs}>`;
	return `<${tag}${attrs}>${node.childNodes.map(serializeRaw).join("")}</${tag}>`;
}

// Snapshot for comparing old and new: whitespace runs collapsed, attributes sorted, input state included.
function snapshot(node) {
	if (node instanceof Text) return node.data.replace(/\s+/g, " ");
	const attrs = [...node.attributes_]
		.map(([k, v]) => [k, v.replace(/\s+/g, " ").trim()])
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => ` ${k}="${v}"`)
		.join("");
	const state = node.tagName === "INPUT" ? ` {checked=${node.checked} value=${node.value}}` : "";
	return `<${node.tagName.toLowerCase()}${attrs}${state}>${node.childNodes.map(snapshot).join("")}</${node.tagName.toLowerCase()}>`;
}

function pathOf(el) {
	const parts = [];
	for (let n = el; n instanceof Element; n = n.parentNode) {
		const parent = n.parentNode;
		const index = parent && parent.childNodes ? parent.childNodes.indexOf(n) : 0;
		parts.unshift(`${n.tagName.toLowerCase()}[${index}]`);
		if (!(parent instanceof Element) && !(parent instanceof Document)) {
			parts.unshift("(detached)");
			break;
		}
	}
	return parts.join("/");
}

module.exports = { Document, Element, Text, parseInto, snapshot, pathOf };
