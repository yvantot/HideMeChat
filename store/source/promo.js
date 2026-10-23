// The promo tiles' four features, drawn with the extension's own icons (js/shared/icons.js), and the logo card,
// which stays out until Messenger's and Facebook's official logo files are in store/logos/.
const FEATURES = [
	["hide", "Hide"],
	["pin", "Pin"],
	["blur", "Blur"],
	["lock", "Lock"],
];

const script = document.createElement("script");
script.src = "../../js/shared/icons.js";
script.onload = () => {
	const holder = document.getElementById("features");
	const labels = holder.hasAttribute("data-labels");
	holder.innerHTML = FEATURES.map(
		([name, label]) => `<div class="feature"><i><svg viewBox="0 0 24 24">${ICONS[name]}</svg></i>${labels ? label : ""}</div>`
	).join("");
};
document.head.appendChild(script);

const logos = document.getElementById("logos");
logos.querySelectorAll("img").forEach((img) => img.addEventListener("error", () => (logos.hidden = true)));
