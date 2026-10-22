// The page's parts in use (js/content/parts.js): rules from GitHub in front of the built-in ways, the health log
// the popup's report shows (js/content/health.js), and errors caught on the page.
const { contentWorld, messagesPage, stored, chat } = require("./support/helpers");

const URL = "https://www.facebook.com/messages/t/2";
const css = (w, id) => w.doc.getElementById(id)?.textContent ?? "";
const health = (w) => {
	const before = w.log.length;
	w.message({ message: "health" });
	const line = w.log.slice(before).find((l) => l.startsWith("sendResponse"));
	return JSON.parse(line.slice(13));
};
const logTexts = (w) => w.run("healthLog.map((entry) => entry.text)");
const rules = (parts, version = "2026-11-03") => ({ version, parts, skipped: 0 });
const withRules = (pageRules, on = true) => ({ ...stored([chat("2", { isObfuscated: true })], { layoutFixes: on }), pageRules });
const rulesChecks = (w) => w.log.filter((l) => l === 'runtime.sendMessage {"message":"pageRulesCheck"}').length;

// Messenger renamed the message rows' attribute: the built-in way finds nothing.
const renamed = messagesPage("fb", ["1", "2"]).replace(/data-scope="messages_table"/g, 'data-scope="message_row"');
const rowRule = rules({ messageRow: { ways: ["div[data-scope='message_row']"], replace: false } });

module.exports = async (check) => {
	// ---------- rules from GitHub ----------
	{
		const w = contentWorld(URL, renamed, stored([chat("2", { isObfuscated: true })]));
		const answer = health(w);
		check("renamed rows, no rules: reported missing", answer.parts.messageRow === "missing" && answer.ok === false && answer.rules === null);
		check("layout fixes off: GitHub never asked", rulesChecks(w) === 0);
	}
	{
		const w = contentWorld(URL, renamed, withRules(rowRule));
		const answer = health(w);
		check("rule: finds the renamed rows, tried before the built-in way", answer.parts.messageRow === "rule 1" && answer.ok && answer.rules === "2026-11-03", JSON.stringify(answer.parts));
		check("rule: stylesheets match rows by any way", css(w, "hidechat-obfuscate").includes(`[data-hc-obfuscated] :is(div[data-scope='message_row'], div[data-scope='messages_table']) :is(div[dir='auto']`));
		check("rule: @ rules found in the renamed rows", !!w.doc.querySelector('[data-obfblr="true"]'));
		check("rule: logged for the report", logTexts(w).includes("Using layout rules 2026-11-03 from GitHub"));
		check("rule: the background asked to check GitHub once per page load", rulesChecks(w) === 1);
		w.listeners.storageChanged.forEach((f) => f({ messengerChats: {} }));
		check("rule: not asked again when settings change", rulesChecks(w) === 1);
	}
	{
		const w = contentWorld(URL, renamed, withRules(rowRule, false));
		check("layout fixes off: saved rules not used", health(w).parts.messageRow === "missing" && w.run("Parts.rulesVersion") === null);
	}
	{
		const w = contentWorld(URL, renamed, withRules(rules({ messageRow: { ways: ["div[data-scope='message_row']"], replace: true } })));
		check("replacing rule: used instead of the built-in way", w.run("Parts.selectors('messageRow').join()") === "div[data-scope='message_row']" && css(w, "hidechat-obfuscate").includes(`[data-hc-obfuscated] div[data-scope='message_row'] :is(`));
	}
	{
		const unreadable = rules({ messageRow: { ways: ["div:nope(1)", "a{}", "div[data-scope='message_row']"], replace: true } });
		const w = contentWorld(URL, renamed, withRules(unreadable));
		check("unreadable or unsafe rules left out, the rest used", w.run("Parts.selectors('messageRow').join()") === "div[data-scope='message_row']" && health(w).parts.messageRow === "rule 3");
		check("unreadable rules logged", logTexts(w).filter((t) => /left out: this browser can't read it/.test(t)).length === 2, JSON.stringify(logTexts(w)));
		const all = rules({ messageRow: { ways: ["div:nope(1)"], replace: true } });
		const w2 = contentWorld(URL, renamed, withRules(all));
		check("replacing rule that can't be read: the built-in way stays", w2.run("Parts.selectors('messageRow').join()") === "div[data-scope='messages_table']");
	}
	{
		// Rules arrive (or go) while the page is open.
		const w = contentWorld(URL, renamed, stored([chat("2", { isObfuscated: true })]));
		w.storage.preferences.layoutFixes = true;
		w.storage.pageRules = rowRule;
		w.listeners.storageChanged.forEach((f) => f({ pageRules: {} }));
		check("new rules used at once", health(w).parts.messageRow === "rule 1");
		w.storage.messengerChats.push(chat("1", { isHidden: true }));
		w.listeners.storageChanged.forEach((f) => f({ rulesCheck: {} }));
		check("a saved check alone doesn't restyle the page", !css(w, "hidechat-hidden").includes("/t/1/"));
		w.listeners.storageChanged.forEach((f) => f({ messengerChats: {} }));
		check("other changes do", css(w, "hidechat-hidden").includes("/t/1/"));
		w.storage.preferences.layoutFixes = false;
		delete w.storage.pageRules;
		w.listeners.storageChanged.forEach((f) => f({ preferences: {}, pageRules: {} }));
		check("rules turned off: back to the built-in ways, logged", health(w).parts.messageRow === "missing" && logTexts(w).at(-1) === "Using the built-in layout rules");
	}

	// ---------- the health log ----------
	{
		const w = contentWorld(URL, messagesPage("fb", ["1", "2"]), stored([chat("2", { isObfuscated: true })]));
		const look = () => {
			w.fireObservers();
			w.clock.advance(4000);
		};
		w.clock.advance(4000);
		check("health log: nothing to note on a healthy page", logTexts(w).length === 0);
		w.doc.querySelectorAll("[data-scope]").forEach((row) => row.setAttribute("data-scope", "renamed"));
		look();
		check("health log: a change waits for a second look", logTexts(w).length === 0);
		look();
		check("health log: rows going missing logged", JSON.stringify(logTexts(w)) === '["message rows: not found, and this page needs it"]', JSON.stringify(logTexts(w)));
		look();
		look();
		check("health log: not repeated while they stay missing", logTexts(w).length === 1);
		w.doc.querySelectorAll("[data-scope]").forEach((row) => row.setAttribute("data-scope", "messages_table"));
		look();
		look();
		check("health log: rows coming back logged", logTexts(w).at(-1) === "message rows: found by its main way");
		check("health log: parts that just aren't on the page left out", !logTexts(w).some((t) => /stickers|quoted|pop-ups/.test(t)));
		const quiet = w.log.length;
		w.clock.advance(20000);
		check("health log: no checks without page changes", !w.log.slice(quiet).some((l) => /setTimeout/.test(l)));
		const answer = health(w);
		check("health answer: the log, the rules and when the page loaded", answer.log.length === 2 && answer.rules === null && typeof answer.loadedAt === "number");
		check("health answer: no names, messages or chat ids", !/Name \d|hello|secret|\/t\/\d/.test(JSON.stringify({ ...answer, kind: "" })), JSON.stringify(answer));
	}
	{
		const w = contentWorld(URL, messagesPage("fb", ["1", "2"]), stored([chat("2", { isObfuscated: true })]));
		const shown = [];
		w.ctx.console = { ...console, error: (...args) => shown.push(args.map(String).join(" ")) };
		w.run("markAtRules = () => { throw new TypeError('no row in chat 1234567890'); };");
		w.fireObservers();
		w.fireObservers();
		const entries = w.run("healthLog.filter((entry) => entry.kind === 'error')");
		check("errors: caught and logged once, then counted", entries.length === 1 && entries[0].count === 2 && entries[0].text === "page update: TypeError: no row in chat …", JSON.stringify(entries));
		check("errors: long numbers (chat ids) cut out", !/\d{5}/.test(entries[0].text));
		check("errors: still shown in the console", shown.length === 2 && /Hide Me Chat:/.test(shown[0]));
		check("errors: the observer keeps running", !w.log.some((l) => /observer threw/.test(l)));
		check("errors: in the health answer", health(w).log.some((entry) => entry.kind === "error"));
	}
};
