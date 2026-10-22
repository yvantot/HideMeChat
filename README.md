# Hide Me Chat

Hide Me Chat, previously Hide Chat, is a browser extension that keeps your Messenger chats away from people looking at your screen or briefly using your computer. It can hide, pin, obfuscate or lock chats with a password, on facebook.com (Messages and chat pop-ups) and messenger.com.

## How to use

1. Right-click a chat in the chat list.
2. Choose **Hide Me Chat**, then what to do with it.
3. Click the extension's icon to see your chats, switch features on or off, or briefly show hidden chats on the page. Settings are behind the sliders icon.

## Features

🙈 **Hide chats**: remove chats from the chat list. "Hide all other chats" keeps only the one you right-clicked.

📌 **Pin chats**: keep chats at the top of the list, in a color you choose.

🫥 **Obfuscate chats**: blur, pixelate, flip, dim or black out a chat's messages and who it's with:
- **In the chat:** messages, photos, sender names, reply headers, attachments and read receipts.
- **Around it:** the name and picture in the chat's header, its pinned message, its info panel (including the username), its row in the chat list, and its Facebook pop-up.

Hover over anything to see it clearly.

🔐 **Lock chats**: cover a chat with a password screen. Its messages, its preview in the chat list and its Facebook pop-up stay hidden until you enter the password. The extension's popup and settings ask for the same password. The password is saved as a salted hash, never as text, and the lock form runs in the extension's own frame, so Messenger's page can't read what you type.

📐 **Obfuscate single messages**: put one of these in a message and it shows obfuscated for anyone who has Hide Me Chat:

- `@pxl` pixelates it
- `@blr` blurs it
- `@flp` flips it
- `@dim` dims it

🎨 **Customizable**: choose how text and media are obfuscated, how strong the blur is, how far to dim (down to invisible), and the pinned color. Light and dark themes.

💾 **Backup**: export your chats and settings to a file and import them again, from any version of Hide Me Chat.

## What it can and can't protect

- It stops people from reading your chats over your shoulder or while briefly using your computer. Everything happens on your screen only: your chats aren't changed, and other people see them as usual.
- It doesn't stop someone who has your unlocked computer for a while and knows their way around a browser. They can use the browser's developer tools, turn the extension off, or open Messenger on another browser or device.
- Facebook and Messenger still have all your messages. Hide Me Chat doesn't encrypt anything.
- Locked and obfuscated chats are matched to Facebook pop-ups by the chat's name. If you rename a chat, open the extension's popup once while Messenger is open so it picks up the new name.

## What's new in 3.0.0

- Works with today's facebook.com and messenger.com again, including encrypted chats.
- The right-click menu works again.
- Finds the page's parts by their structure rather than Facebook's ever-changing class names, and the popup warns you if Messenger's layout changes in a way it can't follow.
- Reacts to page changes instead of checking the page several times a second.
- Pinned chats move to the top without fighting Messenger; Facebook pop-ups follow each chat's own settings.
- An honest lock: hashed password, a lock form the page can't read, a locked popup, hidden previews and pop-ups, and no more stuck password prompts.
- Obfuscation covers who a chat is with (header, info panel, pinned message, pop-up), adds a black bar option, and can dim all the way to invisible.
- A calmer, rounded popup, settings and lock screen with light and dark themes and gentle animations. Settings open inside the popup, without a page load. The Quicksand font is bundled, so nothing loads from remote servers.
- Exports work with names in any language, and imports accept backups from v1 and v2.
- Many smaller fixes; see `docs/findings-2026-10.md`.

## Development

There's no build step: load the folder with **Load unpacked** in `chrome://extensions`.

- **Tests:** `node tests/run.js` (Node 20 or newer, no dependencies). They run the real scripts against a small fake DOM and Chrome API, including sanitized captures of the live pages in `tests/fixtures/`.
- **New page captures:** when Messenger changes its layout, paste `tests/tools/snapshot.js` into the DevTools console on the page. It copies a sanitized capture: no names, messages or ids.
- **Releasing:** see `docs/release-checklist.md`.
- **Font:** Quicksand, by The Quicksand Project Authors, under the SIL Open Font License 1.1 (`fonts/Quicksand-OFL.txt`).

<details>
<summary>v2.0.0 changes</summary>

- Errors and bugs fixes.
- Now works with facebook.com, facebook.com/messages.
- No special permissions.
- Revamped user interface & added dark mode.
- Latest modified chats detail in UI.
- Hide chats.
- Pin chats to the top.
- Lock chats with password.
- Obfuscate messages: blur, pixelate, flip or dim.
- Use @rule to obfuscate a single message.
- Export/import data.
- User preferences & customizations.
- Backward compatible with previous version.

</details>
