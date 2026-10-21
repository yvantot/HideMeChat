// The settings page (html/setting.html): autosaving options, password form, backup.
const { pageWorld, chat, stored, prefs, errors, hashPassword, verifyPassword, waitFor, settleAll } = require("./support/helpers");

const URL = "chrome-extension://fakeid/html/setting.html";
const unlocked = { session: { popupUnlockedUntil: Date.now() + 10 * 60000 } };
const chip = (w, group, method) => w.doc.querySelector(`.chips[data-group="${group}"] .chip[data-method="${method}"]`);

async function open(data, options = unlocked) {
	const w = pageWorld("setting", URL, data, options);
	await settleAll();
	return w;
}

module.exports = async (check) => {
	const record = await hashPassword("hunter22");

	{
		const w = await open(stored([chat("1", { isHidden: true })]));
		const $ = (id) => w.doc.getElementById(id);
		check("shows the saved methods", chip(w, "text", "opacity").getAttribute("aria-pressed") === "true" && chip(w, "text", "blur").getAttribute("aria-pressed") === "false" && chip(w, "image", "pixelate").getAttribute("aria-pressed") === "true");
		check("shows the slider values", $("blur-desc").textContent === "5" && $("opacity-desc").textContent === "0.3");
		check("no personal content or language alert", !/dalman|Change Language|@gmail/i.test(w.doc.documentElement.textContent));

		w.storage.messengerChats.push(chat("8", { isPinned: true }));
		await chip(w, "text", "blur").dispatch("click");
		await settleAll();
		check("a chip saves straight away, in v2's method order", w.storage.preferences.obfMethod.text.join() === "blur,flip,opacity" && w.storage.messengerChats.length === 2, w.storage.preferences.obfMethod.text.join());
		check("saving shows a toast", $("toast").classList.contains("show") && $("toast").textContent === "Saved");

		$("blur-val").value = "7";
		await $("blur-val").dispatch("input");
		check("slider label follows while dragging", $("blur-desc").textContent === "7" && w.storage.preferences.obfMethod.blurIntensity === 5);
		await $("blur-val").dispatch("change");
		await settleAll();
		check("slider saves when released", w.storage.preferences.obfMethod.blurIntensity === 7);

		await $("reset-obfuscate").dispatch("click");
		await settleAll();
		check("reset restores the defaults", w.storage.preferences.obfMethod.text.join() === "flip,opacity" && w.storage.preferences.obfMethod.blurIntensity === 5 && chip(w, "text", "blur").getAttribute("aria-pressed") === "false");

		$("pinned-color").value = "#ff8800";
		await $("pinned-color").dispatch("change");
		await settleAll();
		check("pinned color saves on change", w.storage.preferences.pinnedColor === "#ff8800");
		check("settings: no errors", errors(w).length === 0, errors(w).join(" | "));
	}

	// ---------- password ----------
	{
		const w = await open(stored([], { password: record }));
		const $ = (id) => w.doc.getElementById(id);
		check("password set: button says Change", $("change-password").textContent === "Change");
		await $("change-password").dispatch("click");
		check("form opens smoothly with the current-password field", $("password-collapse").classList.contains("open") && !$("password-current").hidden && $("change-password").textContent === "Close");
		const save = async (current, next, confirm) => {
			$("password-current").value = current;
			$("password-new").value = next;
			$("password-confirm").value = confirm;
			await $("password-form").dispatch("submit");
			return $("password-message").textContent;
		};
		check("wrong current password refused", /current password is wrong/.test(await save("nope", "newpass1", "newpass1")) && w.storage.preferences.password.hash === record.hash);
		check("short password refused", /at least 5/.test(await save("hunter22", "abc", "abc")));
		check("mismatch refused", /don't match/.test(await save("hunter22", "newpass1", "newpass2")));
		check("password changed", /Password saved/.test(await save("hunter22", "newpass1", "newpass1")));
		check("new works, old doesn't", (await verifyPassword("newpass1", w.storage.preferences.password)) && !(await verifyPassword("hunter22", w.storage.preferences.password)));
		check("never stored or logged as text", !JSON.stringify(w.storage).includes("newpass1") && !w.log.some((l) => l.includes("newpass1")));

		await $("export-data").dispatch("click");
		const exported = Buffer.from(w.blobs[0], "base64").toString("utf8");
		check("export holds the hash, not the password", exported.includes('"hash"') && !exported.includes("newpass1") && w.log.some((l) => /hidemechat_backup_\d{4}-\d{2}-\d{2}\.txt/.test(l)));
		w.clock.advance(1000);
		check("export frees its object URL", w.log.includes("revokeObjectURL blob:fake/1"));
	}
	{
		const w = await open(stored([]));
		const $ = (id) => w.doc.getElementById(id);
		check("no password: button says Set, explains why", $("change-password").textContent === "Set" && /Not set yet/.test($("password-status").textContent));
		await $("change-password").dispatch("click");
		check("no current-password field", $("password-current").hidden);
		$("password-new").value = "first1";
		$("password-confirm").value = "first1";
		await $("password-form").dispatch("submit");
		check("first password created", (await verifyPassword("first1", w.storage.preferences.password)) === true);
	}

	// ---------- import ----------
	{
		const w = await open(stored([chat("1", { isHidden: true, chatName: "Ñoño 😀 Привет" })]));
		await w.doc.getElementById("export-data").dispatch("click");
		const backup = w.blobs[0];

		const fresh = await open(stored([chat("9", { isPinned: true })]));
		const $ = (id) => fresh.doc.getElementById(id);
		// The file is read on the fake clock, so the change handler is awaited after the clock moves on.
		const choose = async (text) => {
			$("import-data").files = [{ text }];
			const handled = $("import-data").dispatch("change", { target: $("import-data") });
			fresh.clock.advance(5);
			await handled;
			await waitFor(() => !$("import-confirm").hidden || $("toast").classList.contains("show"), 3000);
		};
		await choose(backup);
		check("import asks before replacing, inline", !$("import-confirm").hidden && fresh.storage.messengerChats[0].chatURL === "/t/9/" && !fresh.log.some((l) => l.startsWith("confirm")));
		await $("import-cancel").dispatch("click");
		check("cancel keeps the current data", $("import-confirm").hidden && fresh.storage.messengerChats[0].chatURL === "/t/9/");
		await choose(backup);
		await $("import-replace").dispatch("click");
		await settleAll();
		check("replace restores the backup, names intact", fresh.storage.messengerChats.map((c) => c.chatName).join() === "Ñoño 😀 Привет" && /restored/.test($("toast").textContent));

		$("toast").classList.remove("show");
		await choose("not a backup");
		check("a bad file says so, nothing changes", /isn't a Hide Me Chat backup/.test($("toast").textContent) && $("import-confirm").hidden);

		const v2 = Buffer.from(JSON.stringify({ preferences: prefs({ userPassword: "v2secret" }), messengerChats: [chat("2", { isLocked: true, chatName: "Ñoño" })] }), "latin1").toString("base64");
		await choose(v2);
		await $("import-replace").dispatch("click");
		await settleAll();
		check("v2 backups import: Latin-1 names and a hashed password", fresh.storage.messengerChats[0]?.chatName === "Ñoño" && !JSON.stringify(fresh.storage).includes("v2secret") && (await verifyPassword("v2secret", fresh.storage.preferences.password)) && fresh.storage.schemaVersion === 3);
		const v1 = Buffer.from(JSON.stringify({ hidden_chat: ["/t/5/"] })).toString("base64");
		await choose(v1);
		await $("import-replace").dispatch("click");
		await settleAll();
		check("v1 backups import too", fresh.storage.messengerChats.map((c) => c.chatURL).join() === "/t/5/" && !("hidden_chat" in fresh.storage));
	}

	// ---------- gate ----------
	{
		const w = await open(stored([], { password: record }), {});
		await waitFor(() => !w.doc.getElementById("hc-gate").hidden, 2000);
		check("settings locked too", !w.doc.getElementById("hc-gate").hidden);
		await w.doc.getElementById("export-data").dispatch("click");
		await chip(w, "text", "blur").dispatch("click");
		check("nothing works while locked", !w.blobs?.length && !w.log.some((l) => l.startsWith("storage.set") && l.includes('"blur","opacity"')));
	}
};
