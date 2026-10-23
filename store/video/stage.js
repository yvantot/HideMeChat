// The demo video: everyday moments when someone can see your screen, and the feature that helps with each one.
//   1. Sam walks by while you plan his surprise party: hide the chat.
//   2. Mom's chat: pin it to the top.
//   3. Your boss looks over your shoulder: blur (obfuscate) your chat with Alex. Only you can read it, by pointing.
//   4. Leo wants to see what you bought him: the gift shop chat is locked.
//   5. Party day: "Show hidden" in the toolbar popup brings the party chat back.
// Each scene goes caption, then person, then action, then effect, with a spotlight on the one thing to look at.
// The popup and lock screen are the extension's own pages, fed made-up chats by stub.js.
//
// render(t) draws the moment t seconds in from nothing but t, so render.mjs can capture the frames one by one.
const CHATS = [
	{ id: "alex", name: "Alex", initial: "A", color: "#8b9cff", preview: "Movie tonight? · 1m" },
	{ id: "party", name: "Sam's surprise party", initial: "🎉", color: "#ffe1ec", preview: "Mia: Don't tell Sam! · 3m" },
	{ id: "work", name: "Work team", initial: "W", color: "#6fc29c", preview: "Meeting moved to 2pm · 20m" },
	{ id: "gift", name: "Gift shop", initial: "G", color: "#f2b766", preview: "Your order is ready! · 1h" },
	{ id: "priya", name: "Priya", initial: "P", color: "#be95f0", preview: "Thanks for the notes! · 2h" },
	{ id: "dad", name: "Dad", initial: "D", color: "#63bcd4", preview: "Call me later · 3h" },
	{ id: "mom", name: "Mom", initial: "M", color: "#f29a87", preview: "Did you eat yet? · 5h" },
];
const ROW = 62;
const ORDER = CHATS.map((chat) => chat.id);
const PINNED_ORDER = ["mom", ...ORDER.filter((id) => id !== "mom")];
const BLUR = 4.5;
// The camera on the whole window, leaving room above it for the captions.
const WHOLE = [640, 350, 0.95];
// How dark the veil around the spotlight gets.
const DIM = 0.4;
const ICON = {
	pin: '<path d="M12 16v6M8 3h8l-1 6 3 3v2H6v-2l3-3z" />',
	lock: '<rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />',
};
const CONFETTI_COLORS = ["#ffcf4d", "#ff7eb6", "#5b9dff", "#6fd18f", "#ff9a5c", "#9b8cff"];

// The people, drawn with a few flat shapes (viewBox 0 0 120 130).
const PEOPLE = {
	sam: { name: "Sam", skin: "#c98c5f", hair: "#3b2a20", shirt: "#5b9dff", hairStyle: "short" },
	boss: { name: "Boss", skin: "#f1c7a3", hair: "#9aa0a8", shirt: "#3d4466", hairStyle: "sides", glasses: true },
	leo: { name: "Leo", skin: "#f5d0b0", hair: "#e8843c", shirt: "#6fd18f", hairStyle: "tuft" },
};
const HAIR = {
	short: '<path d="M24 58 C22 32 40 21 60 21 C82 21 99 34 96 58 C90 44 78 39 60 40 C43 39 30 45 24 58 Z" />',
	sides: '<path d="M25 64 C23 48 29 39 37 36 C33 45 32 55 33 64 Z" /><path d="M95 64 C97 48 91 39 83 36 C87 45 88 55 87 64 Z" />',
	tuft: '<path d="M24 58 C22 32 40 21 60 21 C82 21 99 34 96 58 C90 44 78 39 60 40 C43 39 30 45 24 58 Z" /><path d="M58 22 C55 10 66 6 71 13" fill="none" stroke-width="5" stroke-linecap="round" />',
};
const MOUTH = {
	smile: "M50 78 Q60 87 70 78",
	meh: "M52 81 L68 81",
	sad: "M51 84 Q60 76 69 84",
};

const $ = (selector, root = document) => root.querySelector(selector);
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
// Overshoots a little and settles: a friendly bounce.
const bounce = (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
// Progress from 0 to 1 between the times a and b, eased (0 for something that never happens: a is Infinity).
const progress = (t, a, b, curve = ease) => (t <= a ? 0 : t >= b ? 1 : curve((t - a) / (b - a)));
const mix = (a, b, k) => a + (b - a) * k;
const set = (element, styles) => Object.assign(element.style, styles);

// ---------- the timeline ----------

// When each thing happens, in seconds, filled in by buildTimeline(). Anything not set never happens.
const at = {};
const when = (name) => at[name] ?? Infinity;
const path = [];
const clicks = [];
const menus = [];
const captions = [];
const shots = [];
const lights = [];
const people = {};
let now = 0;
// Where things are, in the world the camera looks at, measured once everything has loaded.
const spot = {};

function moveTo(point, duration) {
	const last = path[path.length - 1];
	if (last.t < now) path.push({ t: now, x: last.x, y: last.y });
	now += duration;
	path.push({ t: now, x: point.x, y: point.y });
}

function wait(seconds) {
	now += seconds;
}

function click() {
	const { x, y } = path[path.length - 1];
	clicks.push({ t: now, x, y });
	now += 0.12;
	return now - 0.12;
}

function caption(title, text) {
	captions.push({ start: now, title, text });
}

// Points the camera at (x, y) in the world, magnified `scale` times, moving there over `duration` from `start`.
function shoot(start, x, y, scale, duration = 0.8) {
	shots.push({ start, end: start + duration, x, y, scale });
}

// Dims everything but `rect` ({ x, y, w, h, r } in the world) from `start`; null lifts the veil.
function spotlight(start, rect, duration = 0.45) {
	lights.push({ start, end: start + duration, rect });
}

// Someone who can see the screen, coming up from the bottom: `left` is where, `side` which way they talk.
function enter(id, { left, side }) {
	people[id] = { ...PEOPLE[id], left, side, in: now, out: Infinity, lines: [], puzzled: Infinity };
}

function leave(id) {
	people[id].out = now;
}

// A line in a speech bubble and the face that goes with it, shown for `seconds` (or until they leave), so it's
// gone before the next action.
function say(id, text, mood, seconds = Infinity) {
	people[id].lines.push({ t: now, end: now + seconds, text, mood });
}

// Right-clicks a chat, points at Hide Me Chat in the menu and clicks the submenu item at `index`. Returns when the
// item was clicked.
function useMenu(id, index) {
	moveTo(rowPoint(id, now + 0.75), 0.75);
	wait(0.1);
	const { x, y } = path[path.length - 1];
	// Like Chrome's, the menus open upward when there's no room below.
	const bottom = spot.windowBottom - 8;
	const menu = { open: now, x: x + 2, y: y + 2 + spot.menuHeight > bottom ? y - 2 - spot.menuHeight : y + 2, index };
	menus.push(menu);
	click();
	wait(0.2);
	moveTo({ x: menu.x + 70, y: menu.y + spot.menuItem.y }, 0.45);
	menu.mainAt = now - 0.15;
	menu.sub = now + 0.08;
	menu.subX = menu.x + spot.menuWidth - 4;
	menu.subY = Math.min(menu.y + spot.menuItem.top - 6, bottom - spot.submenuHeight);
	wait(0.2);
	moveTo({ x: menu.subX + 30, y: menu.y + spot.menuItem.y }, 0.25);
	moveTo({ x: menu.subX + 64, y: menu.subY + spot.subItems[index] }, 0.4);
	menu.itemAt = now - 0.15;
	wait(0.15);
	const clicked = click();
	menu.close = now;
	return clicked;
}

function buildTimeline() {
	path.push({ t: 0, x: 600, y: 600 });
	shoot(-1, 300, 400, 1.25, 0);

	// 1. Sam walks by while you plan his surprise party.
	caption("Hide a chat", "Sam can't see his surprise party.");
	wait(0.5);
	enter("sam", { left: 1010, side: "left" });
	wait(0.5);
	say("sam", "Hey, what's that?", "curious", 1.5);
	wait(1.7);
	spotlight(now, spot.area.list);
	wait(0.3);
	at.hide = useMenu("party", 0) + 0.05;
	wait(0.7);
	say("sam", "Hmm, nothing there.", "meh");
	people.sam.puzzled = now;
	wait(1.4);
	leave("sam");
	spotlight(now, null);
	wait(0.4);

	// 2. Mom's chat, kept at the top.
	caption("Pin a chat", "Keep Mom at the top.");
	wait(0.4);
	spotlight(now, spot.area.list);
	wait(0.3);
	at.pin = useMenu("mom", 2) + 0.05;
	at.heart = at.pin + 0.7;
	wait(1.5);
	spotlight(now, null);

	// 3. Your boss looks over your shoulder.
	shoot(now, ...WHOLE);
	caption("Blur a chat", "Your boss can't read it.");
	wait(0.6);
	enter("boss", { left: 110, side: "right" });
	wait(0.5);
	say("boss", "Busy?", "curious", 1.2);
	wait(1.4);
	spotlight(now, spot.area.list);
	wait(0.3);
	at.obfuscate = useMenu("alex", 3) + 0.05;
	spotlight(at.obfuscate, spot.area.main);
	wait(0.7);
	say("boss", "Good. Keep working!", "smile");
	wait(1.4);
	leave("boss");
	wait(0.3);
	shoot(now, Math.max(spot.hover.x + 60, 820), spot.hover.y + 20, 1.55, 0.7);
	spotlight(now, spot.area.message, 0.7);
	caption("Only you can read it", "Point at a message to see it.");
	wait(0.5);
	moveTo(spot.hover, 0.7);
	at.hoverIn = now;
	wait(1.3);
	at.hoverOut = now + 0.1;
	moveTo({ x: spot.hover.x + 150, y: spot.hover.y + 160 }, 0.5);
	wait(0.3);
	spotlight(now, null);

	// 4. Leo wants to see what you bought him.
	shoot(now, ...WHOLE, 0.7);
	caption("Lock a chat", "Only your password opens it.");
	wait(0.5);
	spotlight(now, spot.area.list);
	wait(0.3);
	at.lock = useMenu("gift", 4) + 0.05;
	wait(0.5);
	moveTo(rowPoint("gift", now + 0.6), 0.6);
	at.openGift = click();
	spotlight(now + 0.2, spot.area.lock);
	shoot(now + 0.2, spot.lockCard.x, spot.lockCard.y, 1.45, 0.7);
	wait(0.9);
	enter("leo", { left: 1010, side: "left" });
	wait(0.5);
	say("leo", "What did you buy?", "curious", 1.3);
	wait(1.5);
	say("leo", "Aww, it's locked.", "sad");
	wait(1.2);
	leave("leo");
	wait(0.4);
	moveTo(spot.password, 0.6);
	at.focusPassword = click();
	wait(0.1);
	at.typeStart = now;
	wait(0.8);
	at.typeEnd = now;
	wait(0.1);
	moveTo(spot.unlock, 0.4);
	at.unlock = click();
	spotlight(at.unlock + 0.2, null);
	wait(0.8);

	// 5. Party day: the hidden chat comes back.
	shoot(now, 1000, 325, 1.25);
	caption("Bring it back", "Show hidden chats from the toolbar.");
	wait(0.5);
	spotlight(now, spot.area.extension);
	moveTo(spot.extension, 0.8);
	at.popup = click();
	spotlight(at.popup + 0.1, spot.area.popup);
	wait(0.8);
	moveTo(spot.showHidden, 0.7);
	at.showHidden = click();
	wait(0.4);
	at.popupClose = now;
	moveTo({ x: spot.showHidden.x - 120, y: spot.showHidden.y + 260 }, 0.6);
	shoot(at.popupClose, ...WHOLE, 0.8);
	spotlight(at.popupClose + 0.2, spot.area.list);
	at.reveal = at.popupClose + 0.4;
	at.confetti = at.reveal + 0.4;
	wait(2.4);

	at.end = now;
	// The first caption is up from the first frame, and the last stays to the end.
	captions[0].start = -1;
	captions.forEach((entry, i) => (entry.end = captions[i + 1]?.start ?? Infinity));
}

// ---------- the chat list ----------

// How much room a row takes, from 0 (gone) to 1. Only the party chat is hidden, then shown again.
function rowRoom(id, t) {
	if (id !== "party") return 1;
	return clamp(1 - progress(t, when("hide") + 0.1, when("hide") + 0.8) + progress(t, when("reveal"), when("reveal") + 0.6));
}

function rowTops(t) {
	const place = (order) => {
		const tops = {};
		let y = 0;
		for (const id of order) {
			tops[id] = y;
			y += ROW * rowRoom(id, t);
		}
		return tops;
	};
	const before = place(ORDER);
	const after = place(PINNED_ORDER);
	const pinned = progress(t, when("pin"), when("pin") + 0.8);
	return Object.fromEntries(ORDER.map((id) => [id, before[id] + (after[id] - before[id]) * pinned]));
}

function rowPoint(id, t) {
	return { x: spot.list.x + 130, y: spot.list.y + rowTops(t)[id] + ROW / 2 };
}

// ---------- camera, spotlight and cursor ----------

function cameraAt(t) {
	let view = shots[0];
	for (const shot of shots) {
		if (t < shot.start) break;
		const k = shot.end > shot.start ? progress(t, shot.start, shot.end) : 1;
		view = { x: mix(view.x, shot.x, k), y: mix(view.y, shot.y, k), scale: mix(view.scale, shot.scale, k) };
	}
	return view;
}

function lightAt(t) {
	let light = { x: 0, y: 0, w: 0, h: 0, r: 0, alpha: 0 };
	for (const entry of lights) {
		if (t < entry.start) break;
		const k = progress(t, entry.start, entry.end);
		if (!entry.rect) {
			light = { ...light, alpha: mix(light.alpha, 0, k) };
		} else if (light.alpha < 0.01) {
			// From no veil, the window opens where it's needed while the veil fades in.
			light = { ...entry.rect, alpha: mix(0, DIM, k) };
		} else {
			const to = entry.rect;
			light = { x: mix(light.x, to.x, k), y: mix(light.y, to.y, k), w: mix(light.w, to.w, k), h: mix(light.h, to.h, k), r: mix(light.r, to.r, k), alpha: mix(light.alpha, DIM, k) };
		}
	}
	return light;
}

function toScreen(point, view) {
	return { x: 640 + (point.x - view.x) * view.scale, y: 360 + (point.y - view.y) * view.scale };
}

function cursorAt(t) {
	if (t <= path[0].t) return path[0];
	for (let i = 1; i < path.length; i++) {
		const a = path[i - 1];
		const b = path[i];
		if (t < b.t) {
			const k = b.t === a.t ? 1 : ease(clamp((t - a.t) / (b.t - a.t)));
			return { x: mix(a.x, b.x, k), y: mix(a.y, b.y, k) };
		}
	}
	return path[path.length - 1];
}

// ---------- drawing ----------

function render(t) {
	const view = cameraAt(t);
	set($("#world"), { transform: `translate(${640 - view.x * view.scale}px, ${360 - view.y * view.scale}px) scale(${view.scale})` });

	// Captions, one at a time.
	for (const entry of captions) {
		const shown = progress(t, entry.start, entry.start + 0.3) * (1 - progress(t, entry.end - 0.2, entry.end));
		set(entry.element, { opacity: shown, transform: `scale(${0.85 + 0.15 * progress(t, entry.start, entry.start + 0.4, bounce)})` });
	}

	// The spotlight. The veil reaches well past the world, so it covers the edges the camera can see.
	const light = lightAt(t);
	set($("#veil"), { opacity: light.alpha });
	const hole = $("#hole-rect");
	hole.setAttribute("x", light.x + 1000);
	hole.setAttribute("y", light.y + 1000);
	hole.setAttribute("width", Math.max(light.w, 0));
	hole.setAttribute("height", Math.max(light.h, 0));
	hole.setAttribute("rx", light.r);

	// Effects, from 0 to 1.
	const obfuscated = progress(t, when("obfuscate"), when("obfuscate") + 0.5);
	const hovered = progress(t, when("hoverIn"), when("hoverIn") + 0.15) * (1 - progress(t, when("hoverOut"), when("hoverOut") + 0.15));
	const locked = progress(t, when("lock"), when("lock") + 0.4);
	const pinned = progress(t, when("pin") + 0.4, when("pin") + 0.9);
	const textBlur = BLUR * obfuscated;

	// The chat list.
	const tops = rowTops(t);
	const active = t < when("openGift") ? "alex" : "gift";
	for (const chat of CHATS) {
		const row = spot.rows[chat.id];
		set(row, { top: `${tops[chat.id]}px`, zIndex: chat.id === "mom" ? 2 : 1 });
		set($(".selected", row), { opacity: chat.id === active ? 1 : 0 });
		if (chat.id === "party") {
			set(row, { opacity: clamp(1 - progress(t, when("hide"), when("hide") + 0.35) + progress(t, when("reveal") + 0.2, when("reveal") + 0.6)) });
		}
		if (chat.id === "mom") {
			set($(".tint", row), { opacity: pinned });
			set($(".pin", row), { opacity: pinned, transform: `scale(${progress(t, when("pin") + 0.4, when("pin") + 0.8, bounce)})` });
		}
		if (chat.id === "alex") set($(".content", row), { filter: textBlur ? `blur(${textBlur}px)` : "" });
		if (chat.id === "gift") {
			set($(".preview", row), { opacity: 1 - locked });
			set($(".lock", row), { opacity: locked, transform: `scale(${progress(t, when("lock") + 0.1, when("lock") + 0.5, bounce)})` });
		}
	}
	const heart = progress(t, when("heart"), when("heart") + 1.2);
	set($("#heart"), {
		opacity: heart > 0 && heart < 1 ? 1 - Math.pow(heart, 3) : 0,
		transform: `translate(${spot.list.x + 232}px, ${spot.list.y - 16 - 30 * heart}px) scale(${progress(t, when("heart"), when("heart") + 0.35, bounce)})`,
	});

	// The open chat.
	set($("#conv-alex"), { opacity: active === "alex" ? 1 : 0 });
	set($("#conv-gift"), { opacity: active === "gift" ? 1 : 0 });
	document.querySelectorAll(".alex-text").forEach((element) => {
		const blur = element.id === "hover-target" ? textBlur * (1 - hovered) : textBlur;
		set(element, { filter: blur ? `blur(${blur}px)` : "" });
	});
	set($(".alex-avatar"), { filter: obfuscated ? `blur(${BLUR * obfuscated}px)` : "" });
	set($("#photo-pixel"), { opacity: obfuscated });

	// The lock screen over the gift shop's chat, and the password typed into it.
	const cover = progress(t, when("openGift") + 0.1, when("openGift") + 0.45) * (1 - progress(t, when("unlock") + 0.1, when("unlock") + 0.5));
	set(spot.cover, { opacity: cover });
	set(spot.lockFrame, { transform: `scale(${0.92 + 0.08 * progress(t, when("openGift") + 0.15, when("openGift") + 0.6, bounce)})` });
	const typed = Math.round(8 * progress(t, when("typeStart"), when("typeEnd")));
	if (spot.passwordInput.value.length !== typed) spot.passwordInput.value = "x".repeat(typed);
	const focused = t >= when("focusPassword") && t < when("unlock");
	if (focused && spot.lockDocument.activeElement !== spot.passwordInput) spot.passwordInput.focus();
	if (!focused && spot.lockDocument.activeElement === spot.passwordInput) spot.passwordInput.blur();

	// The popup, before and after "Show hidden", until it closes.
	const shownPopup = t < when("popup") ? null : t < when("showHidden") ? "chats" : "shown";
	const open = progress(t, when("popup"), when("popup") + 0.35, bounce) * (1 - progress(t, when("popupClose"), when("popupClose") + 0.3));
	for (const [name, frame] of Object.entries(spot.popups)) {
		set(frame, { opacity: name === shownPopup ? clamp(open * 1.5) : 0, transform: `scale(${0.88 + 0.12 * open})` });
	}

	// Confetti for the party chat's return.
	const since = t - when("confetti");
	for (const piece of spot.confetti) {
		const live = since >= 0 && since < piece.life;
		set(piece.element, {
			opacity: live ? clamp((piece.life - since) / 0.4) : 0,
			transform: live
				? `translate(${piece.x + piece.vx * since}px, ${piece.y + piece.vy * since + 450 * since * since}px) rotate(${piece.spin * since}deg)`
				: "",
		});
	}

	// The right-click menu.
	const menu = menus.find((m) => t >= m.open && t < m.close + 0.12);
	const menuOpacity = menu ? progress(t, menu.open, menu.open + 0.1) * (1 - progress(t, menu.close, menu.close + 0.1)) : 0;
	set(spot.menu, { opacity: menuOpacity, transform: menu ? `translate(${menu.x}px, ${menu.y}px)` : "" });
	const subOpen = !!menu && t >= menu.sub;
	set(spot.submenu, { opacity: subOpen ? menuOpacity : 0, transform: subOpen ? `translate(${menu.subX}px, ${menu.subY}px)` : "" });
	$("#menu-hmc").classList.toggle("on", !!menu && t >= menu.mainAt);
	spot.submenu.querySelectorAll(".item").forEach((item, i) => item.classList.toggle("on", subOpen && i === menu.index && t >= menu.itemAt));

	// The cursor, and a ripple where it clicks.
	const cursor = cursorAt(t);
	set($("#cursor"), { transform: `translate(${cursor.x - 4.6}px, ${cursor.y - 2.8}px)` });
	const ripple = clicks.find((c) => t >= c.t && t < c.t + 0.4);
	const k = ripple ? (t - ripple.t) / 0.4 : 1;
	set($("#ripple"), { opacity: ripple ? 0.9 * (1 - k) : 0, transform: ripple ? `translate(${ripple.x}px, ${ripple.y}px) scale(${0.4 + 0.9 * k})` : "" });

	for (const person of Object.values(people)) drawPerson(person, t, view);
}

function drawPerson(person, t, view) {
	const up = progress(t, person.in, person.in + 0.55, bounce) * (1 - progress(t, person.out, person.out + 0.45));
	set(person.element, {
		opacity: up > 0.01 ? 1 : 0,
		transform: `translateY(${(1 - up) * 200}px) rotate(${Math.sin(t * 2.2 + person.left) * 1.5 * up}deg)`,
	});

	// Eyes follow the cursor, then look around when what they wanted to see is gone.
	const cursor = toScreen(cursorAt(t), view);
	const face = { x: person.left + 75, y: 720 - 100 };
	let dx = clamp((cursor.x - face.x) / 60, -3.5, 3.5);
	let dy = clamp((cursor.y - face.y) / 60, -3.5, 2);
	if (t >= person.puzzled) {
		dx = 3.5 * Math.sin((t - person.puzzled) * 7);
		dy = -1.5;
	}
	const blink = [1.7, 4.2].some((offset) => t - person.in > offset && t - person.in < offset + 0.14);
	person.eyes.forEach((eye) => set(eye, { transform: `translate(${dx}px, ${dy}px) scaleY(${blink ? 0.15 : 1})` }));

	// The face matches what they last said; the bubble shows while the line lasts.
	const line = [...person.lines].reverse().find((entry) => t >= entry.t);
	const mood = line?.mood ?? "smile";
	person.mouth.setAttribute("d", MOUTH[mood] ?? "");
	person.mouthO.setAttribute("opacity", mood === "curious" ? 1 : 0);
	if (line && person.bubble.textContent !== line.text) person.bubble.textContent = line.text;
	const pop = line ? progress(t, line.t, line.t + 0.35, bounce) : 0;
	const fade = line ? 1 - progress(t, line.end - 0.2, line.end) : 0;
	set(person.bubble, { opacity: line ? clamp(pop * 2) * fade * up : 0, transform: `scale(${0.6 + 0.4 * pop})` });
}

// ---------- setup ----------

function buildRows() {
	const list = $("#list");
	const search = $("#search");
	list.style.top = `${search.offsetTop + search.offsetHeight + 10}px`;
	spot.rows = {};
	for (const chat of CHATS) {
		const row = document.createElement("div");
		row.className = "row";
		row.innerHTML = `
			<div class="layer selected"></div><div class="layer tint"></div>
			<div class="content">
				<span class="av" style="background: ${chat.color}">${chat.initial}</span>
				<div class="text"><div class="name">${chat.name}</div><div class="preview">${chat.preview}</div></div>
				<svg class="tag pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICON.pin}</svg>
				<svg class="tag lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICON.lock}</svg>
			</div>`;
		list.appendChild(row);
		spot.rows[chat.id] = row;
	}
}

function buildPeople() {
	const holder = $("#people");
	for (const person of Object.values(people)) {
		person.element = document.createElement("div");
		person.element.className = "person";
		const eye = (cx) => `<circle class="eye" cx="${cx}" cy="63" r="4.6" fill="#22263a" style="transform-box: fill-box; transform-origin: center" />`;
		const glasses = person.glasses
			? '<g fill="none" stroke="#22263a" stroke-width="2.4"><circle cx="47" cy="63" r="9" /><circle cx="73" cy="63" r="9" /><path d="M56 63 H64" /></g>'
			: "";
		person.element.innerHTML = `
			<div class="bubble ${person.side}"></div>
			<svg viewBox="0 0 120 130">
				<path d="M14 130 Q14 102 40 98 L80 98 Q106 102 106 130 Z" fill="${person.shirt}" />
				<rect x="51" y="88" width="18" height="14" fill="${person.skin}" />
				<circle cx="60" cy="60" r="36" fill="${person.skin}" />
				<g fill="${person.hair}" stroke="${person.hair}">${HAIR[person.hairStyle]}</g>
				${eye(47)}${eye(73)}${glasses}
				<circle cx="37" cy="75" r="5.5" fill="#ff8fa3" opacity="0.35" />
				<circle cx="83" cy="75" r="5.5" fill="#ff8fa3" opacity="0.35" />
				<path class="mouth" fill="none" stroke="#22263a" stroke-width="3.2" stroke-linecap="round" />
				<ellipse class="mouth-o" cx="60" cy="80" rx="4" ry="5" fill="#22263a" opacity="0" />
			</svg>
			<div class="name-tag">${person.name}</div>`;
		set(person.element, { left: `${person.left}px`, opacity: 0 });
		person.bubble = $(".bubble", person.element);
		set(person.bubble, person.side === "left" ? { right: "70px" } : { left: "70px" });
		person.eyes = [...person.element.querySelectorAll(".eye")];
		person.mouth = $(".mouth", person.element);
		person.mouthO = $(".mouth-o", person.element);
		holder.appendChild(person.element);
	}
}

function buildCaptions() {
	const holder = $("#captions");
	for (const entry of captions) {
		entry.element = document.createElement("div");
		entry.element.className = "caption";
		entry.element.innerHTML = `<h1>${entry.title}</h1><p>${entry.text}</p>`;
		holder.appendChild(entry.element);
	}
}

function buildConfetti() {
	// A fixed seed, so every render throws the same confetti.
	let seed = 7;
	const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
	const origin = rowPoint("party", when("reveal") + 1);
	const holder = $("#confetti");
	spot.confetti = Array.from({ length: 70 }, (_, i) => {
		const element = document.createElement("div");
		element.className = "confetti";
		element.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
		holder.appendChild(element);
		const angle = -Math.PI / 2 + (random() - 0.5) * 2.2;
		const speed = 300 + random() * 320;
		return { element, x: origin.x - 40 + random() * 160, y: origin.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: (random() - 0.5) * 900, life: 1.5 + random() * 0.6 };
	});
}

function loaded(frame) {
	return new Promise((resolve) => {
		if (frame.contentDocument?.readyState === "complete" && frame.contentDocument.location.href !== "about:blank") resolve();
		else frame.addEventListener("load", resolve, { once: true });
	});
}

// The middle of `element` in the world; `frame` is the frame it's in, if any. Measured before the camera moves.
function middle(element, frame) {
	const box = element.getBoundingClientRect();
	const offset = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
	return { x: offset.left + box.left + box.width / 2, y: offset.top + box.top + box.height / 2 };
}

// An area for the spotlight: `element`'s box grown by `margin`, with rounded corners.
function area(element, margin, radius) {
	const box = element.getBoundingClientRect();
	return { x: box.left - margin, y: box.top - margin, w: box.width + 2 * margin, h: box.height + 2 * margin, r: radius };
}

async function init() {
	buildRows();
	const frames = [...document.querySelectorAll("iframe")];
	await Promise.all([document.fonts.ready, ...frames.map(loaded)]);
	await new Promise((resolve) => setTimeout(resolve, 1200));

	spot.popups = { chats: $("#popup-chats"), shown: $("#popup-shown") };
	const chatsDoc = spot.popups.chats.contentDocument;
	for (const frame of Object.values(spot.popups)) frame.style.height = `${frame.contentDocument.documentElement.scrollHeight}px`;
	spot.cover = $("#lock-cover");
	spot.lockFrame = $("#lock-frame");
	spot.lockDocument = spot.lockFrame.contentDocument;
	spot.passwordInput = $("#unlock-password", spot.lockDocument);
	spot.menu = $("#menu");
	spot.submenu = $("#submenu");

	const list = $("#list").getBoundingClientRect();
	spot.list = { x: list.left, y: list.top };
	spot.menuWidth = spot.menu.offsetWidth;
	spot.menuHeight = spot.menu.offsetHeight;
	spot.submenuHeight = spot.submenu.offsetHeight;
	spot.windowBottom = $(".window").getBoundingClientRect().bottom;
	const hmc = $("#menu-hmc");
	spot.menuItem = { top: hmc.offsetTop, y: hmc.offsetTop + hmc.offsetHeight / 2 };
	spot.subItems = [...spot.submenu.querySelectorAll(".item")].map((item) => item.offsetTop + item.offsetHeight / 2);
	spot.hover = middle($("#hover-target"));
	spot.extension = middle($("#extension"));
	spot.lockCard = middle(spot.lockFrame);
	spot.password = middle(spot.passwordInput, spot.lockFrame);
	spot.unlock = middle($("#unlock-form button[type=submit]", spot.lockDocument), spot.lockFrame);
	spot.showHidden = middle($(".switch .track", chatsDoc), spot.popups.chats);
	spot.area = {
		list: area($("#sidebar"), 0, 0),
		main: area($("#main"), 0, 0),
		message: area($("#hover-target"), 10, 26),
		lock: area(spot.lockFrame, 14, 30),
		extension: area($("#extension"), 8, 12),
		popup: area(spot.popups.chats, 8, 22),
	};

	// The veil, far bigger than the world so it covers whatever the camera shows.
	set($("#spotlight"), { left: "-1000px", top: "-1000px", width: "3280px", height: "2720px" });

	buildTimeline();
	buildPeople();
	buildCaptions();
	buildConfetti();
	window.stageDuration = at.end;
	render(0);
	window.stageReady = true;
}

window.render = render;
init();
