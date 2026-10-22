# Release checklist

## Before testing

1. Run `node tests/run.js`. Every test should pass.
2. Bump `version` in `manifest.json`. The popup shows it automatically.
3. Reload the extension in `chrome://extensions` and check it shows no **Errors** button.

## Quick health check on a live page

On facebook.com/messages or messenger.com, with a chat open, open DevTools:

1. In the Console's context dropdown (top left, "top"), pick **Hide Me Chat**.
2. Run `Page.health()`.

Every part should say `"anchor"`. `"fallback"` means Messenger changed something and the class-name fallback took over. `"missing"` means a feature is broken there. The popup shows a yellow warning in that case too.

## Manual checks

Do these on **facebook.com/messages**, **messenger.com**, and the **Facebook home page** (Messenger dropdown and a chat pop-up). On the first two, try a regular chat and an encrypted one.

| Feature | Check |
|---|---|
| Right-click menu | Each item flags the chat; it then shows in the popup with that toggle on. |
| Hide | Hidden chats are gone from the list; **Show hidden** in the popup brings them back until it's switched off. |
| Hide all other chats | Every other chat in the list is hidden. |
| Pin | Pinned chats are at the top, in the pinned color, and stay there when new messages arrive. |
| Obfuscate | Messages, the chat-list row, the header's name and picture, the pinned message, the info panel and the chat's pop-up are obfuscated; hovering shows each one; other chats and pop-ups are untouched. Try each method, including **Black bar**, and dim at 0 (invisible until hovered). |
| @ rules | A message with `@blr`, `@pxl`, `@flp` or `@dim` shows that effect. |
| Lock | The lock screen covers the chat (and fades in) with a rounded card and no square edges around it, in both themes; the preview is hidden; the pop-up is covered with a link. The right password unlocks it, a wrong one shakes the form. |
| No password yet | Locking a chat shows "Create a password"; after saving, the password unlocks. |
| Popup | Asks for the password when one is set, then stays unlocked for 5 minutes; toggles work; rows animate in and out; empty state when nothing is flagged. |
| Settings | Opens and closes inside the popup with a slide, no white flash; changes save at once with a "Saved" toast; password change needs the current password; export, then import the file again. |
| Themes | Light and dark look right in the popup, settings and lock screen, in the Quicksand font. |
| Console | No errors from Hide Me Chat on any page. |

## Packaging

Commit first, then build the zip for the Chrome Web Store from the committed files. It leaves out `tests/` and `docs/` (keep `fonts/`: it holds the font and its license):

```
git archive --format=zip -o hide-me-chat-3.0.0.zip HEAD manifest.json assets css fonts html js
```
