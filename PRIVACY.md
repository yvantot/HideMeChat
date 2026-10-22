# Hide Me Chat privacy policy

Last updated: October 22, 2026

Hide Me Chat doesn't collect, sell or share your data. Nothing about you or your chats is sent to the developer or to anyone else.

## What it handles, on your device only

- **Chats you choose.** When you flag a chat (hide, pin, obfuscate or lock), Hide Me Chat saves its name, its picture link, its address on Messenger, the time of its last message as shown in the chat list, and which features are on. These come from the Messenger page and are kept in your browser's extension storage.
- **Your settings**, and your Hide Me Chat password as a salted hash. The password itself is never saved.
- **The page itself.** While facebook.com or messenger.com is open, Hide Me Chat looks at the page to hide, pin, obfuscate or lock chats, and to find `@blr`, `@pxl`, `@flp` and `@dim` in messages. Message text is never saved.
- **Reports.** A report you copy from the popup holds no names, messages or links, and goes only to your clipboard.

## Network

Hide Me Chat makes no network requests of its own unless you turn on **Layout fixes** in its settings. Then it downloads one file, `https://raw.githubusercontent.com/yvantot/HideMeChat/main/rules/page-rules.json`, at most once a day and when you ask it to. The file holds page rules, not code. The request carries no cookies and no data about you; like any web request, GitHub sees your IP address and browser ([GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)).

## Your control

- Turn any feature off for a chat in the popup, and Hide Me Chat forgets that chat.
- **Export** saves your chats and settings to a file on your computer; nothing is uploaded.
- Removing the extension deletes everything it stored.

## Questions

Open an issue at <https://github.com/yvantot/HideMeChat/issues>.
