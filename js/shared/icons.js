// Line icons for Hide Me Chat's pages, drawn on a 24×24 grid. They take the text color of where they're placed.
const ICONS = {
	hide: '<path d="M3 3l18 18"/><path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c5.5 0 9 5 10 7a13 13 0 0 1-2.9 3.9"/><path d="M6.4 6.4C3.9 8 2.5 10.4 2 12c1 2 4.5 7 10 7a9.7 9.7 0 0 0 5.3-1.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
	pin: '<path d="M9 4h6"/><path d="M10 4v5l-3 4h10l-3-4V4"/><path d="M12 13v7"/>',
	lock: '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>',
	blur: '<g fill="currentColor" stroke="none"><circle cx="6" cy="6" r="1"/><circle cx="12" cy="6" r="1.6"/><circle cx="18" cy="6" r="1"/><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="2.4"/><circle cx="18" cy="12" r="1.6"/><circle cx="6" cy="18" r="1"/><circle cx="12" cy="18" r="1.6"/><circle cx="18" cy="18" r="1"/></g>',
	settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
	moon: '<path d="M20 14.6A8 8 0 1 1 9.4 4a6.3 6.3 0 0 0 10.6 10.6z"/>',
	sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
	back: '<path d="M15 5l-7 7 7 7"/>',
	chat: '<path d="M4 12a8 7 0 1 1 3.4 5.7L4 19l1-3.3A6.6 6.6 0 0 1 4 12z"/>',
	download: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
	upload: '<path d="M12 15V4"/><path d="M7 9l5-5 5 5"/><path d="M5 20h14"/>',
};

function icon(name) {
	return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

// Fills every element marked data-icon="name" with that icon.
function fillIcons(root = document) {
	root.querySelectorAll("[data-icon]").forEach((element) => {
		element.innerHTML = icon(element.getAttribute("data-icon"));
	});
}
