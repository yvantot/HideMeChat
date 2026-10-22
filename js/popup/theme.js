// Applies the saved theme before the page is drawn, so it doesn't flash light first. chrome.storage can only be
// read asynchronously, so the popup and the lock screen keep a copy of the theme in localStorage for this.
try {
	if (localStorage.getItem("hmc-theme") === "dark") document.documentElement.classList.add("dark");
} catch {
	// Storage can be unavailable; the saved theme is then applied once chrome.storage answers.
}
