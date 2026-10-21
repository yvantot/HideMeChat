let lockInterval;
let unlockedChats = new Set();

// Every second, covers the open chat with the lock screen if it's locked and hasn't been unlocked yet.
function makeLockedInject(data) {
	const lockedUrls = new Set(data.messengerChats.filter((chat) => chat.isLocked).map((chat) => chat.chatURL));

	if (lockInterval) clearInterval(lockInterval);
	lockInterval = setInterval(() => {
		if (lockedUrls.has(getCurrentChat())) {
			if (unlockedChats.has(getCurrentChat())) return;
			lockChat(data);
		} else {
			unlockChat();
		}
	}, 1000);
}

// Keeps prompting until a password of at least 5 characters is saved.
// v2 bug, kept for now: cancelling the prompt never ends the loop.
function setPassword(data) {
	while (!data.preferences.userPassword || data.preferences.userPassword.length < 5) {
		let password = data.preferences.userPassword;
		if (password) {
			if (password.length < 5) {
				password = prompt(
					`Your current password is '${password}'. The password must be at least 5 characters long:`
				);
			}
		} else {
			password = prompt(
				"You haven't set a password yet. Please create one to lock this chat. The password must be at least 5 characters long:"
			);
		}

		if (password && password.length >= 5) {
			alert("Your password is: " + password);
			data.preferences.userPassword = password;
			storage.set(data);
		} else {
			alert("The password must be at least 5 characters long. Please try again.");
		}
	}
}

function lockChat(data) {
	setPassword(data);
	if (document.getElementById("hc-lockedmain")) return;

	const inbox = document.querySelector(SELECTORS.INBOXDETAIL);
	const messages = document.querySelector(SELECTORS.MESSAGECONTAINER);
	const infoPanel = document.querySelector(SELECTORS.INBOXDETAILRIGHT);
	messages?.setAttribute("style", "display: none !important;");
	infoPanel?.setAttribute("style", "display: none !important;");

	const lockScreen = lockedUIHTML();
	inbox?.setAttribute("style", "position: relative !important;");
	inbox?.insertBefore(lockScreen, inbox.firstChild);

	const unlockButton = lockScreen.querySelector("#hc-unlockpass");
	const passwordInput = lockScreen.querySelector("#hc-lockedpass");
	passwordInput?.focus();

	const tryUnlock = () => {
		if (passwordInput.value.trim() === data.preferences.userPassword.trim()) {
			unlockChat();
			unlockedChats.add(getCurrentChat());
		}
	};
	unlockButton?.addEventListener("click", () => tryUnlock());
	passwordInput?.addEventListener("keydown", (event) => {
		if (event.key === "Enter") tryUnlock();
	});
}

function unlockChat() {
	const lockScreen = document.getElementById("hc-lockedmain");
	if (!lockScreen) return;
	lockScreen.remove();
	document.querySelector(SELECTORS.INBOXDETAIL)?.removeAttribute("style");
	document.querySelector(SELECTORS.MESSAGECONTAINER)?.removeAttribute("style");
	document.querySelector(SELECTORS.INBOXDETAILRIGHT)?.removeAttribute("style");
}

function lockedUICSS() {
	const style = document.createElement("style");
	style.setAttribute("id", "hidechat-lockedchat");
	style.innerHTML = `
		#hc-lockedmain {
			position: absolute;
			inset: 0;
			z-index: 214748364;
			font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
			font-size: 16px;
			color: #FAFAFA;
			background-color: rgba(0, 0, 0, 0.8);
			backdrop-filter: blur(10px);
		}
		#hc-container {
			width: 100%;
			height: 100%;
			display: flex;
			text-align: center;
			flex-direction: column;
			justify-content: center;
			align-items: center;
		}
		#hc-group {
			max-width: 50%;
			background-color: rgba(0, 21, 90, 0.8);
			padding: 20px;
			border-radius: 5px;
		}
		#hc-container p{
			font-weight: normal;
			text-decoration: none;
			font-size: 1rem;
			line-height: 1.6rem;
		}
		#hc-container input{
			font-weight: normal;
			text-decoration: none;
			font-size: 0.9rem;
			outline: none;
			border: none;
			background-color: white;
		}
		#hc-container button{
			cursor: pointer;
			background-color: #5a5a5a;
			padding: 5px;
			border-radius: 3px;
			transition: transform 1s;
			outline: none;
			border: none;
		}
		#hc-container button:hover{
			transform: scale(1.2);
			background-color: #474747;
		}
		.hc-horizontal{
			width: 90%;
			display: inline-flex;
			align-items: center;
			justify-content: space-between;
			gap: 2px;
			background-color: white;
			padding: 5px;
			border-radius: 5px;
		}
	`;
	document.head.append(style);
}

function lockedUIHTML() {
	const lockScreen = document.createElement("div");
	lockScreen.setAttribute("id", "hc-lockedmain");
	lockScreen.innerHTML = `
		<div id="hc-container">
			<div id="hc-group">
				<p>This chat is protected by <strong>Hide Chat</strong></p>
				<div class="hc-horizontal">
					<input type="password" id="hc-lockedpass" placeholder="Input password" maxlength="126" autocomplete="off">
					<button id="hc-unlockpass">
						<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="#FAFAFA"><path d="M240-640h360v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85h-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640Zm0 480h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM240-160v-400 400Z"/></svg>
					</button>
				</div>
			</div>
		</div>
		`;
	return lockScreen;
}
