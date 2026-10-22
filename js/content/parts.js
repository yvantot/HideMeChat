// The ways to find each part of the page in use now (see shared/pageParts.js): ways from the GitHub rules first,
// when layout fixes are on, then the built-in ones. A way this browser can't read is left out and logged.
const Parts = {
	// part name -> [{ selector, source: "rule" | "built-in", index }]
	ways: {},
	rulesVersion: null,

	// Starts using `rules` ({ version, parts } as the background saved them), or only the built-in ways for null.
	use(rules) {
		const version = rules?.version ?? null;
		const changed = version !== Parts.rulesVersion;
		Parts.rulesVersion = version;
		for (const [name, part] of Object.entries(PAGE_PARTS)) {
			const extra = rules?.parts?.[name];
			const fromRules = (extra?.ways ?? [])
				.map((selector, index) => ({ selector, source: "rule", index }))
				.filter((way) => {
					if (isSafeSelector(way.selector) && canParse(way.selector)) return true;
					if (changed) logEvent("rules", `GitHub rule ${way.index + 1} for the ${part.label} left out: this browser can't read it`);
					return false;
				});
			const builtIn = part.ways.map((selector, index) => ({ selector, source: "built-in", index }));
			Parts.ways[name] = extra?.replace && fromRules.length ? fromRules : [...fromRules, ...builtIn];
		}
		if (changed) logEvent("rules", version ? `Using layout rules ${version} from GitHub` : "Using the built-in layout rules");
	},

	selectors(name) {
		return Parts.ways[name].map((way) => way.selector);
	},

	// One selector that matches the part by any of its ways, for stylesheets.
	css(name) {
		const selectors = Parts.selectors(name);
		return selectors.length === 1 ? selectors[0] : `:is(${selectors.join(", ")})`;
	},

	// The part's elements in `root`, found by the first of its ways that finds any, and that way.
	find(name, root = document) {
		for (const way of Parts.ways[name]) {
			const elements = [...root.querySelectorAll(way.selector)];
			if (elements.length) return { elements, way };
		}
		return { elements: [], way: null };
	},

	all(name, root = document) {
		return Parts.find(name, root).elements;
	},

	first(name, root = document) {
		for (const way of Parts.ways[name]) {
			const element = root.querySelector(way.selector);
			if (element) return element;
		}
		return null;
	},

	// `element` or its closest ancestor that is the part, by any of its ways.
	closest(element, name) {
		return element.closest(Parts.selectors(name).join(", "));
	},

	// A selector list for `inner` parts inside `outer` parts, by every pair of their ways.
	inside(outer, inner) {
		return Parts.selectors(outer)
			.flatMap((outerWay) => Parts.selectors(inner).map((innerWay) => `${outerWay} ${innerWay}`))
			.join(", ");
	},

	// The status (see describeStatus) of a part found by `way`.
	status(way) {
		if (way.source === "rule") return `rule ${way.index + 1}`;
		return way.index === 0 ? "main" : `backup ${way.index}`;
	},
};

function canParse(selector) {
	try {
		document.documentElement.matches(selector);
		return true;
	} catch {
		return false;
	}
}

Parts.use(null);
