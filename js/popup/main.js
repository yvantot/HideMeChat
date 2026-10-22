// Starts the popup: its two views (chats and settings) live in one page, so moving between them is instant and
// animated rather than loading another page.

// Shows the view named `name`; going back to the chats slides in from the other side.
async function showView(name) {
	const next = document.getElementById(`view-${name}`);
	const current = [...document.querySelectorAll(".view")].find((view) => !view.hidden);
	if (!next || next === current) return;
	if (current) {
		await animateOut(current, "leaving", 160);
		current.hidden = true;
		current.classList.remove("leaving");
	}
	if (name === "chats") next.classList.add("back");
	else next.classList.remove("back");
	next.hidden = false;
	window.scrollTo?.(0, 0);
}

fillIcons();
document.getElementById("version").textContent = `Version ${chrome.runtime.getManifest().version}`;
themeToggle();
document.querySelectorAll("[data-go]").forEach((button) => {
	button.addEventListener("click", () => showView(button.getAttribute("data-go")));
});

// Nothing about the chats or settings is shown or wired up until the popup is unlocked.
requireUnlock(async () => {
	await initChats();
	await initSettings();
});
