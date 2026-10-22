# Layout rules

`page-rules.json` is downloaded by Hide Me Chat when someone turns on **Layout fixes** in settings: once a day,
and when they ask for fixes from the popup's warning. It's how a fix for a Messenger layout change reaches people
before the next release goes through the Chrome Web Store.

It's data only. Each part of the page that Hide Me Chat works with (see `PAGE_PARTS` in
`js/shared/pageParts.js`) has built-in ways to find it, which are CSS selectors. The rules add ways in front of
those, or replace them. They never contain code.

## Format

```json
{
	"format": 1,
	"version": "2026-11-03",
	"minVersion": "3.0.0",
	"maxVersion": "3.0.9",
	"parts": {
		"messageRow": ["div[data-scope='message_row']"],
		"messageText": { "ways": ["div[dir='auto'][class]"], "replace": true }
	}
}
```

- `version`: any short text; change it with every edit. The popup's report shows it.
- `minVersion`, `maxVersion` (optional): the versions of Hide Me Chat the rules are for. Set `maxVersion` once a
  release has the fix built in.
- `parts`: a list of ways goes in front of the built-in ones. `{ "ways": [...], "replace": true }` is used
  instead of them, for a built-in way that now finds the wrong thing.
- Up to 8 ways per part, 300 characters each. A way with `{ } ; @ \ <` or a comment is skipped, and so is one
  the browser can't read; the report says so.
- Parts that a version doesn't know are skipped, so rules for newer versions don't break older ones.

Content scripts use the first way that finds a part; stylesheets use all of them.

## Shipping a fix

1. Capture the changed page with `tests/tools/snapshot.js` and add it to `tests/fixtures/`.
2. Find selectors that work, and add them here with a new `version`. `node tests/run.js` checks this file.
3. Commit and push to `main`. GitHub serves the new file within a few minutes.
4. In the next release, add the same ways to `PAGE_PARTS`, then set `maxVersion` here or remove the rules.
