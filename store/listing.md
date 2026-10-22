# Chrome Web Store listing

Everything to fill in the [developer dashboard](https://chrome.google.com/webstore/devconsole), tab by tab. The images are in
`store/media/`. To redraw them after a UI or logo change, run `python store/render.py` (or add `--logo new.svg` to redraw
the extension's icons too).

## Package

Upload `hide-me-chat-3.0.0.zip`, built from the committed files as in `docs/release-checklist.md`. The listing's name and short
description come from `manifest.json`:

- **Name:** Hide Me Chat
- **Summary:** Hide, pin, obfuscate or lock Messenger chats on facebook.com and messenger.com.

## Store listing

**Description**

```
Hide Me Chat keeps your Messenger chats away from people looking at your screen, on facebook.com and messenger.com.

Right-click a chat and choose Hide Me Chat:
• Hide: take the chat out of your chat list.
• Pin: keep the chat at the top of the list.
• Obfuscate: blur, pixelate, flip, dim or black out its messages, name and picture. Hover to read.
• Lock: cover the chat until you enter your password.

Click the extension's icon to see your chats, switch features on or off, and change settings. Light and dark themes.

Your chats aren't changed, and other people see them as usual. Everything stays in your browser.
```

**Category:** Social Media & Networking

**Language:** English

**Graphic assets**

| Field | File |
|---|---|
| Store icon (128x128) | `store/media/icon-128.png` |
| Screenshots (1280x800), in this order | `screenshot-1.png` to `screenshot-5.png` |
| Small promo tile (440x280) | `store/media/promo-small.png` |
| Marquee promo tile (1400x560, optional) | `store/media/promo-marquee.png` |
| Promo video | none |

**Homepage URL:** https://github.com/yvantot/HideMeChat

**Support URL:** https://github.com/yvantot/HideMeChat/issues

**Mature content:** off

## Privacy practices

**Single purpose**

```
Hide Me Chat hides, pins, obfuscates or locks the Messenger chats you choose on facebook.com and messenger.com, so people near your screen can't read them.
```

**Permission justifications**

| Permission | Justification |
|---|---|
| `storage` | Saves the chats you've hidden, pinned, obfuscated or locked, your settings, and a hash of your Hide Me Chat password, in your browser. |
| `contextMenus` | Adds Hide Me Chat to the right-click menu on chat links. That's how you choose a chat to hide, pin, obfuscate or lock. |
| `activeTab` | When you open the popup, it checks whether the current tab is Messenger, refreshes your chats' names from it, and switches "Show hidden" on that page. |
| Host permission (facebook.com, messenger.com) | Hide Me Chat works inside these two sites only: it hides, pins, obfuscates and locks chats on their pages. |

**Remote code:** No, I am not using remote code.

```
All code is in the package. The optional "Layout fixes" setting downloads a JSON file of CSS selectors from the project's GitHub page; it's data the extension reads, never executed.
```

**Data usage.** The store counts data an extension reads or keeps on the device as "handled", even when nothing is sent anywhere, so tick:

- **Personally identifiable information:** names of the chats you flag.
- **Personal communications:** message text is read on the page to obfuscate it and find `@` rules; it's never saved or sent.
- **Authentication information:** a salted hash of your Hide Me Chat password.
- **Website content:** chat names and picture links read from Messenger.

Then tick all three statements: not sold to third parties, not used or transferred for purposes unrelated to the single purpose, not used to determine creditworthiness or for lending.

**Privacy policy URL:** https://github.com/yvantot/HideMeChat/blob/main/PRIVACY.md

## Test instructions (for the reviewer)

```
Needs a Facebook account. Open facebook.com/messages or messenger.com, right-click a chat in the chat list, choose Hide Me Chat, then Hide, Pin, Obfuscate or Lock. Click the extension's icon to see flagged chats and settings. Locking asks to create a password the first time.
```

## Distribution

Public, all regions.
