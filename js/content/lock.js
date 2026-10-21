// Chats unlocked since the page loaded. They stay unlocked until the page reloads.
const unlockedChats = new Set();
let passwordPrompted = false;

// Covers the open chat with the lock screen when it's locked and hasn't been unlocked yet.
// While <html> has data-hc-locked, everything in the conversation area except the lock screen is hidden.
function updateLock(data, onUnlock) {
	const chat = getCurrentChat();
	const lockedUrls = new Set(data.messengerChats.filter((c) => c.isLocked).map((c) => c.chatURL));
	const locked = Page.isMessagesPage() && lockedUrls.has(chat) && !unlockedChats.has(chat);

	setFlag(document.documentElement, "data-hc-locked", locked);
	if (!locked) {
		removeLockScreen();
		return;
	}

	const host = document.querySelector('[role="main"]') ?? Page.conversation();
	if (!host) return;
	setFlag(host, "data-hc-lock-host", true);

	const hasPassword = !!data.preferences.userPassword;
	const existing = document.getElementById("hc-lockedmain");
	if (existing?.parentElement === host && existing.getAttribute("data-has-password") === String(hasPassword)) return;
	existing?.remove();
	const lockScreen = lockedUIHTML(hasPassword);
	host.insertBefore(lockScreen, host.firstChild);

	if (hasPassword) {
		const passwordInput = lockScreen.querySelector("#hc-lockedpass");
		const tryUnlock = () => {
			if (passwordInput.value.trim() === data.preferences.userPassword.trim()) {
				unlockedChats.add(chat);
				onUnlock();
			}
		};
		lockScreen.querySelector("#hc-unlockpass").addEventListener("click", tryUnlock);
		passwordInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter") tryUnlock();
		});
		passwordInput.focus();
	} else if (!passwordPrompted) {
		// Offer to create one once per page load, after the lock screen has been drawn.
		passwordPrompted = true;
		setTimeout(() => setPassword(), 0);
	}
}

function removeLockScreen() {
	document.getElementById("hc-lockedmain")?.remove();
	document.querySelectorAll("[data-hc-lock-host]").forEach((el) => el.removeAttribute("data-hc-lock-host"));
}

// Prompts until a password of at least 5 characters is saved, or the prompt is cancelled.
function setPassword() {
	storage.get(null, (data) => {
		let password = data.preferences.userPassword;
		while (!password || password.length < 5) {
			password = password
				? prompt(`Your current password is '${password}'. The password must be at least 5 characters long:`)
				: prompt(
						"You haven't set a password yet. Please create one to lock this chat. The password must be at least 5 characters long:"
				  );
			if (password === null) return;
			if (password.length < 5) alert("The password must be at least 5 characters long. Please try again.");
		}
		alert("Your password is: " + password);
		data.preferences.userPassword = password;
		storage.set(data);
	});
}

const LOCK_CSS = `
	html[data-hc-locked] [data-hc-lock-host] {
		position: relative !important;
	}
	html[data-hc-locked] [role="main"] > :not(#hc-lockedmain),
	html[data-hc-locked] [data-hc-lock-host] > :not(#hc-lockedmain) {
		visibility: hidden !important;
	}
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

function lockedUIHTML(hasPassword) {
	const lockScreen = document.createElement("div");
	lockScreen.setAttribute("id", "hc-lockedmain");
	lockScreen.setAttribute("data-has-password", String(hasPassword));
	const unlockForm = `
				<div class="hc-horizontal">
					<input type="password" id="hc-lockedpass" placeholder="Input password" maxlength="126" autocomplete="off">
					<button id="hc-unlockpass">
						<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="#FAFAFA"><path d="M240-640h360v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85h-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640Zm0 480h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM240-160v-400 400Z"/></svg>
					</button>
				</div>`;
	const noPassword = `<p>Set a password in HideMeChat's settings to unlock this chat.</p>`;
	lockScreen.innerHTML = `
		<div id="hc-container">
			<div id="hc-group">
				<p>This chat is protected by <strong>Hide Chat</strong></p>
				${hasPassword ? unlockForm : noPassword}
			</div>
		</div>
		`;
	return lockScreen;
}
