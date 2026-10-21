# HideMeChat v3: plan

Goal: HideMeChat works the same on **facebook.com/messages**, **messenger.com** and **facebook.com chat pop-ups**, survives Meta's class renames, and is honest about what its lock protects. The evidence behind each step is in `findings-2026-10.md`.

## 1. Get readable source back

Done in `6d19b28`.

- If the original v2 source still exists somewhere, start from it. If not, unminify the current files into readable modules and keep their behaviour exactly the same at first.
- Stay with plain JS and no build step, to keep the extension small and simple to load unpacked.

## 2. One place that understands the page

Done: `js/content/page.js` (`Page`) finds every container, the features ask it instead of querying the page, and the popup shows a warning when the open Messenger tab is missing parts. The anchors it uses are listed in `findings-2026-10.md`.

- Make one "where am I" layer that decides which page it's on from the URL: Messages on facebook.com, messenger.com, or a normal Facebook page that may have pop-ups or the Messenger dropdown open.
- Each feature asks this layer for the chat list, the current chat, its message list or the conversation area, and never queries the page directly.
- Find elements by ARIA roles and `data-*` attributes first (`grid`, `row`, `log`, `main`, `messages_table`). Keep Meta's class names only as a fallback.
- Add a health check: when the anchors can't be found, the popup says "Messenger changed its layout, some features may not work" instead of failing silently.

## 3. React to changes instead of polling

Done: `js/content/main.js` keeps the page in line with the stored settings using one `MutationObserver` and no timers.
- Hide, pin (highlight and order) and obfuscation are stylesheet rules.
- JS only marks things CSS can't find on its own: chat lists, which open chats are obfuscated, @ rules, and the lock.
- Pinned chats are moved with CSS `order` rather than by moving Facebook's elements.

- Replace the many intervals with one observer on the page and one way of detecting URL changes. Each update re-applies the current state from scratch.
- Never keep an element between updates. Look it up fresh each time, because Messenger replaces the conversation area when you switch chats.
- Move as much as possible into CSS: set the current chat's state as an attribute on `<html>` and let stylesheet rules do the hiding and obfuscating. Fewer moving parts means fewer timing bugs.
- Do nothing on Facebook pages that don't have chats on screen.

## 4. Fix the confirmed bugs

Done, along with every bug in the findings' code-review list except the lock's password handling (step 5). Pop-ups turned out to have no chat link, so they're matched by the chat name in their header instead.

- Pop-up chats follow each chat's own obfuscate setting. A pop-up is identified by the chat link in its header.
- Pin works through the observer, and on the Facebook home page only inside the dropdown.
- Read the "last message" time from the new timestamp span.
- Clean up the popup bugs: the skipped entries, the stuck password prompt, the export URL and the `innerHTML` injection.

## 5. Make the lock honest

Done:
- **Password:** stored as a salted PBKDF2-SHA256 hash (`js/shared/password.js`, 600,000 iterations). v2's plain-text password is upgraded on install/update, on import, and wherever it's read.
- **Exports** carry the hash, so locks survive a restore.
- **Lock screen** is an extension frame (`html/lock.html`), so Messenger's page can't read the password as it's typed. It accepts unlock messages only from that frame's origin and window.
- **Popup and settings** sit behind the same password; an unlock lasts 5 minutes (`chrome.storage.session`).
- **Locked chats** have their chat-list preview hidden and their pop-ups covered.
- **Prompts:** every password `prompt`/`alert` is replaced by a form.

- Store a salted hash of the password, never the password itself. Never show it back. Leave it out of exports, or encrypt the export.
- Replace `prompt`/`alert` with proper in-page and popup forms.
- Lock the popup itself, so nobody can just untick features there.
- A locked chat also hides its preview in the chat list and its pop-up.
- Reword the README: the lock protects against people looking at your screen or using your computer for a moment, not against someone who opens DevTools.

## 6. Data and migration

- Add a schema version to storage, and migrate v2 data and the old v1 `hidden_chat` format the same way `initStorage` does now.
- Keep the shared `/t/<id>/` key so a chat set up on one site applies on the other. Treat `e2ee` chats as their own key, as now.

## 7. Testing

- Keep a few cleaned HTML snapshots of each page (with names and messages removed) to check the anchor layer against without logging in.
- Keep a short manual checklist covering 3 pages × regular/E2EE chats × each feature, run before every release.
- Turn the health check from step 2 into something that can be run from the console.

## 8. Release

- Version 3.0.0. Update the README and store listing, and note what changed with the lock.
- Optional later: a Firefox build, since it supports Manifest V3 too.

## Order

Steps 1 and 2 come first, because everything else builds on them. Steps 3 and 4 go together, since most of the bugs disappear with the observer rewrite. Step 5 is independent and can happen any time after step 1. Steps 6–8 come last.
