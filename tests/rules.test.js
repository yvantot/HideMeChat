// Layout fixes: checking a rules file (js/shared/pageParts.js), the rules file published in rules/, and the
// background downloading it from GitHub.
const { read, backgroundWorld, stored, chat, waitFor } = require("./support/helpers");

const rulesFile = (extra = {}) =>
	JSON.stringify({ format: 1, version: "2026-11-03", parts: { messageRow: ["div[data-scope='message_row']"] }, ...extra });
const layoutFixesOn = (extra = {}) => ({ ...stored([chat("1", { isHidden: true })], { layoutFixes: true }), ...extra });

// Sends a message to the background and waits for its answer.
async function ask(w, request) {
	const before = w.log.length;
	w.message(request);
	await waitFor(() => w.log.slice(before).some((line) => line.startsWith("sendResponse")), 2000);
	const line = w.log.slice(before).find((l) => l.startsWith("sendResponse"));
	return line ? JSON.parse(line.slice(13)) : undefined;
}

module.exports = async (check) => {
	// ---------- checking a rules file ----------
	{
		const w = backgroundWorld(stored());
		const clean = (raw, version = "3.0.0") =>
			w.run(`(() => { try { return cleanPageRules(${JSON.stringify(raw)}, ${JSON.stringify(version)}); } catch (e) { return { error: e.message }; } })()`);

		const published = JSON.parse(read("rules/page-rules.json"));
		const result = clean(published);
		check("published rules file: accepted, nothing skipped", !result.error && result.skipped === 0, JSON.stringify(result));
		check("published rules file: names only parts that exist", Object.keys(published.parts).every((name) => w.run(`Object.hasOwn(PAGE_PARTS, ${JSON.stringify(name)})`)));

		const good = clean({ format: 1, version: " v1 ", parts: { messageRow: ["a.b"], messageText: { ways: ["c"], replace: true }, partOfANewerVersion: ["d"] } });
		check(
			"a list goes in front, { ways, replace } replaces, unknown parts skipped",
			JSON.stringify(good) === JSON.stringify({ version: "v1", parts: { messageRow: { ways: ["a.b"], replace: false }, messageText: { ways: ["c"], replace: true } }, skipped: 0 }),
			JSON.stringify(good)
		);
		const unsafe = ["a { color: red", "a}b", "a;b", "@import x", "a\\62", "a /* x */", "a<b", "x".repeat(301), 5, "", "   ", "a\nb"];
		const caught = unsafe.filter((way) => {
			const cleaned = clean({ format: 1, version: "v", parts: { messageRow: [way, "div[data-x='1']"] } });
			return cleaned.skipped === 1 && cleaned.parts.messageRow.ways.join() === "div[data-x='1']";
		});
		check("anything that could reach past a selector is skipped and counted", caught.length === unsafe.length, `${caught.length}/${unsafe.length}`);
		check("at most 8 ways per part", clean({ format: 1, version: "v", parts: { messageRow: Array.from({ length: 10 }, (_, i) => `div.w${i}`) } }).parts.messageRow.ways.length === 8);

		const errorOf = (raw, version) => clean(raw, version).error ?? "";
		check("not a rules file", /isn't a rules file/.test(errorOf([])) && /isn't a rules file/.test(errorOf("x")));
		check("unknown format", /format this version doesn't know/.test(errorOf({ format: 2, version: "v", parts: {} })));
		check("no version", /no version/.test(errorOf({ format: 1, parts: {} })) && /no version/.test(errorOf({ format: 1, version: "v".repeat(41), parts: {} })));
		check("for newer versions only", errorOf({ format: 1, version: "v", minVersion: "3.1.0", parts: {} }) === "The rules are for version 3.1.0 and newer.");
		check("for older versions only", errorOf({ format: 1, version: "v", maxVersion: "2.9", parts: {} }) === "The rules are for version 2.9 and older.");
		check("for this version", !errorOf({ format: 1, version: "v", minVersion: "3.0.0", maxVersion: "3.0", parts: {} }));
		check("versions compared by number", w.run(`compareVersions("3.0.10", "3.1") < 0 && compareVersions("3.1", "3.1.0") === 0 && compareVersions("3.2", "3.1.9") > 0`));
		check(
			"statuses in words",
			w.run(`["main", "backup 1", "rule 2", "missing", "none"].map(describeStatus).join(" | ")`) ===
				"found by its main way | found by backup way 1 | found by GitHub rule 2 | not found, and this page needs it | not on the page now"
		);
	}

	// ---------- downloading ----------
	{
		const w = backgroundWorld(stored());
		const answer = await ask(w, { message: "pageRulesFetch" });
		check("off: nothing downloaded", answer?.ok === false && answer.error === "Layout fixes are off." && w.fetched.length === 0 && !("rulesCheck" in w.storage));
	}
	{
		const w = backgroundWorld(layoutFixesOn());
		w.fetchResult = { status: 200, body: rulesFile() };
		const answer = await ask(w, { message: "pageRulesFetch" });
		check("download: rules saved for the pages", answer.ok && answer.changed && answer.version === "2026-11-03" && JSON.stringify(w.storage.pageRules) === JSON.stringify({ version: "2026-11-03", parts: { messageRow: { ways: ["div[data-scope='message_row']"], replace: false } }, skipped: 0 }), JSON.stringify(answer));
		check("download: from the project's GitHub, no cookies or referrer", w.fetched[0].url === "https://raw.githubusercontent.com/yvantot/HideMeChat/main/rules/page-rules.json" && JSON.stringify(w.fetched[0].options) === JSON.stringify({ cache: "no-cache", credentials: "omit", referrerPolicy: "no-referrer" }), JSON.stringify(w.fetched[0]));
		check("download: the check is saved with its time", w.storage.rulesCheck.ok === true && Math.abs(w.storage.rulesCheck.at - Date.now()) < 5000);
		check("download: same rules again aren't saved again", (await ask(w, { message: "pageRulesFetch" })).changed === false);

		const failures = [
			[{ status: 404, body: "" }, "GitHub answered with error 404."],
			[{ error: "Failed to fetch" }, "Couldn't reach GitHub."],
			[{ status: 200, body: "{oops" }, "The rules file isn't valid."],
			[{ status: 200, body: "x".repeat(40000) }, "The rules file is too big."],
			[{ status: 200, body: rulesFile({ maxVersion: "2.9" }) }, "The rules are for version 2.9 and older."],
		];
		for (const [fetchResult, error] of failures) {
			w.fetchResult = fetchResult;
			const failed = await ask(w, { message: "pageRulesFetch" });
			check(`download fails: ${error}`, failed.ok === false && failed.error === error && w.storage.rulesCheck.error === error, JSON.stringify(failed));
		}
		check("download fails: the rules from before are kept, chats untouched", w.storage.pageRules?.version === "2026-11-03" && w.storage.messengerChats[0].isHidden === true);
	}
	{
		// Pages ask on load; GitHub is asked at most once a day.
		const hourAgo = layoutFixesOn({ rulesCheck: { at: Date.now() - 3600000, ok: true } });
		const w = backgroundWorld(hourAgo);
		w.fetchResult = { status: 200, body: rulesFile() };
		await ask(w, { message: "pageRulesCheck" });
		check("daily check: not again within a day", w.fetched.length === 0);
		w.storage.rulesCheck.at = Date.now() - 25 * 3600000;
		await ask(w, { message: "pageRulesCheck" });
		check("daily check: again after a day", w.fetched.length === 1 && w.storage.pageRules?.version === "2026-11-03");

		const off = backgroundWorld(stored());
		await ask(off, { message: "pageRulesCheck" });
		check("daily check: never while off", off.fetched.length === 0);
	}
	{
		const w = backgroundWorld(layoutFixesOn());
		w.fetchResult = { status: 200, body: rulesFile() };
		const before = w.log.length;
		w.message({ message: "pageRulesFetch" });
		w.message({ message: "pageRulesCheck" });
		await waitFor(() => w.log.slice(before).filter((l) => l.startsWith("sendResponse")).length === 2, 2000);
		check("one download at a time, however many ask", w.fetched.length === 1);
	}
};
