# HideMeChat v2.0.0: live audit (2026-10-22)

## Setup

- Build tested: v2.0.0 loaded unpacked from `main` at `a482af3`, in Chrome, signed in to Facebook.
- Pages tested:
  - **facebook.com/messages**: one regular chat and one end-to-end encrypted (E2EE) chat
  - **messenger.com**: one regular chat and one E2EE chat
  - **facebook.com home**: the Messenger dropdown and one chat pop-up
- Only chats that were already read were opened, so no read receipts were sent.
- The hide and obfuscate logic was tested by adding the same CSS and attributes the extension adds, then removing them. The extension's saved data was not touched.

## Selectors

| Selector | facebook.com/messages | messenger.com | facebook.com home |
|---|---|---|---|
| `CHATCONTAINER` `div[class='x1n2onr6']` | OK: first match is the chat list (21 chats) | OK: first match is the chat list (27 chats) | **Wrong** while the dropdown is closed: matches 16 story cards. While the Messenger dropdown is open, the first match is the dropdown's chat list. |
| `VIRTUALIZED` `div[data-virtualized='false']` | OK: one wrapper per chat row | OK | OK inside the dropdown |
| `MESSAGECONTAINER` | OK: first match is the message list | OK | OK inside a pop-up |
| `INBOXDETAIL` | OK: the whole conversation area, including the message box | OK | Not present (lock doesn't apply to pop-ups) |
| `INBOXDETAILRIGHT` | OK: the right info panel | OK | Not present |
| `MESSAGEROW` `div[data-scope='messages_table']` | OK: every row is inside `role="log"` | OK | OK inside a pop-up |
| `TEXT`, `REPLYTEXT`, `DIVIMG`, `AIMG` | OK | OK | OK |
| `STICKERS`, `VIDEO` | Not checked: no stickers or videos in the chats tested | Not checked | Not checked |
| `TEXTSPANHIDDEN` | **Changed**: one per row, and it holds only the "·" separator | **Changed** | n/a |

Several selectors match more than one element (the chat-list one up to 6 times, the conversation one 3 times). The code uses `querySelector`, so it gets the first match, which was the right element everywhere except the Facebook home page.

The URLs look the same as in v2:
- facebook.com: `/messages/t/<id>/` and `/messages/e2ee/t/<id>/`
- messenger.com: `/t/<id>/` and `/e2ee/t/<id>/`
- After `getChatId`, both sites reduce to the same `/t/<id>/` key, so a chat saved on one site matches on the other.
- messenger.com also has a sidebar `/t/` link with no ID. It sits outside the chat list, so `getAllChat` doesn't pick it up.

## Features checked against the live page

- **Hide**: the hide CSS collapses the chat row from 72 px to 0 px on both sites, leaving no gap.
- **Obfuscate text**: the text gets flipped and dimmed to 0.3 opacity (the defaults).
- **Obfuscate images**: images get blur plus pixelate.
- **@ rules**: `@blr` and `@pxl` apply.
- **Chat info for the popup**: the profile picture and name are read correctly.

## Bugs confirmed live

1. **Pop-up chats on facebook.com are always obfuscated.** On non-Messages pages, `makeObfInject` marks every message list on the page with `data-obftext="true"`, ignoring the per-chat setting. Live, all 16 text rows and 11 images in an opened pop-up were flipped and dimmed.
2. **Pin never switches from polling to an observer.** `onOrderChange` looks for `CHATCONTAINER MESSAGECONTAINER`, which matches nothing on either site. Because no observer is attached, `pinObserver || i()` restarts the 500 ms interval every 10 seconds, so pin polls forever.
3. **The right-click menu actions are broken, and the popup can't refresh chat details.** `getChatInfo` reads the second `span[aria-hidden='true']` in a chat row, but rows now have only one (it holds "·"). The timestamp, for example "3h", is now a separate leaf span. So `lastMsg` is always empty, and the fallback `lastMsg = "#"` assigns to a `const`, which throws a TypeError.
   - Every `getThisChat` and `getAllChat` request fails, which breaks all five right-click actions (hide, hide all except, pin, lock, obfuscate) and the popup's `updateData`.
   - The one-span markup was seen live. The TypeError was reproduced by running the v2 code against that markup in the step 1 harness; the right-click flow itself wasn't tested live.
4. **Chat-list features hit the wrong element on the Facebook home page.** There, `CHATCONTAINER` matches story cards, so pin colouring and chat-list obfuscation only work while the Messenger dropdown is open.

## Likely bug (DOM evidence, not tested end to end)

5. **Obfuscation probably stops after switching chats on Messenger.** When you switch chats, Messenger swaps in a new message list and conversation area and removes the old ones from the page. `makeObfInject` remembers the message list it found first and only looks again if it has none. Its `MutationObserver` callback writes to that remembered element, so after a chat switch the new messages probably don't get obfuscated. Confirming this needs a chat marked as obfuscated in storage.

## Bugs found by reading the code

- **Lock password:**
  - Stored in plain text.
  - Shown back in `alert`/`prompt` messages.
  - Included in the base64 export.
- **Popup only partly protected:** only the lock toggle asks for the password. Anyone can unhide or un-obfuscate chats from the popup, or delete the overlay in DevTools.
- **No way out of the password prompt:** in the content script's `setPassword`, cancelling loops the prompt and alert forever.
- **Popup cleanup skips chats:** the `storage.onChanged` handler calls `splice` inside `forEach`, so it skips entries. It also calls `storage.set` from inside the change listener.
- **Late null check in `pin.js`:** `getChatId(t.href)` runs before the null check, and the chat list's children are indexed by the pinned-node count.
- **Wrong argument to revoke:** `exportDataToJson` calls `URL.revokeObjectURL` with the Blob instead of the URL.
- **Export fails on some chat names:** export runs `btoa` over the JSON, which throws for characters outside Latin-1 (emoji, most non-Latin scripts), so the export silently does nothing.
- **Settings can overwrite newer data:** the settings page saves the data it read when it opened, so it can overwrite changes made since then (for example a chat hidden in another tab).
- **Theme switch saves the wrong value the second time:** it saves the opposite of the theme read on load, so a second click saves the same value again.
- **HTML injection in the popup:** `appendHiddenChats` puts names, last messages and image URLs from the page into `innerHTML`, with an unquoted `data-chaturl` attribute.
- **Timers that never stop:** the URL check every 500 ms and the lock check every 1 s run on every facebook.com page. On non-Messages pages, pin and obfuscation intervals run forever too.
- **Minified code only:** fixed in step 1, which rewrote the JS readably with the same behaviour. Each kept v2 bug is marked `v2 bug, kept for now` in the source.

## Stable anchors seen on both sites

These are the same on facebook.com/messages and messenger.com, and all of them survive class renames:

| What | Anchor |
|---|---|
| Chat list | `[role="grid"]` → `[role="row"]` → `[role="gridcell"]` → `a[href*="/t/"]` |
| Row wrapper | `[data-virtualized]` |
| Message list | `[role="log"]` |
| Message row | `[data-scope="messages_table"]` (date separators are `[data-scope="date_break"]`) |
| Conversation area | `[role="main"]` (on the Facebook home page this is the feed, so scope by URL) |
| Message box | `[role="textbox"]` |

`aria-label` values change with the user's language, so they're no good as anchors.

## Not tested

- Stickers, videos, voice messages.
- The Requests, Archived and Marketplace folders.
- Narrow window layouts, and Firefox.
- The right-click menu, the popup UI, and the full lock and unlock flow. These change saved data, and `prompt`/`alert` freeze browser automation.
