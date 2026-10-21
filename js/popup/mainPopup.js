// Refreshes the name, picture and last message of stored chats from the chat list in the active tab.
function updateData() {
	chrome.runtime.sendMessage({ message: "updateChats" }, (chats) => {
		if (!chats) return;
		storage.get(null, (data) => {
			const storedUrls = new Set(data.messengerChats.map((stored) => stored.chatURL));
			chats.forEach((chat) => {
				if (!storedUrls.has(chat.url)) return;
				const index = data.messengerChats.findIndex((stored) => stored.chatURL === chat.url);
				if (index === -1) return;
				const stored = data.messengerChats[index];
				data.messengerChats[index] = {
					chatName: chat.name,
					chatImg: chat.img,
					chatURL: chat.url,
					lastMsg: chat.lastMsg,
					dateAdded: stored.dateAdded,
					isHidden: stored.isHidden,
					isLocked: stored.isLocked,
					isPinned: stored.isPinned,
					isObfuscated: stored.isObfuscated,
				};
			});
			storage.set(data);
		});
	});
}

function appendHiddenChats(chats) {
	let html = "";
	chats.forEach((chat) => {
		html += `
			<li
				class="group h-[5.5rem] px-3 flex items-center bg-gray-100 even:bg-gray-50 dark:bg-gray-800 dark:even:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-400 text-gray-600 justify-between hover:bg-gray-200">
				<header class="flex items-center">
					<img class="size-16 rounded-md mr-3 bg-gray-600" src="${chat.chatImg}"/>
					<div class="max-w-44 flex-col flex justify-between">
						<a class="text-xs text-blue-600 truncate block dark:text-blue-400" href="https://www.messenger.com${chat.chatURL}"
							target="_blank">
							<div class="flex gap-2 items-center">
								<h3 class="text-sm font-semibold truncate">${chat.chatName}</h3>
								<span class="text-xs text-gray-400">- ${chat.lastMsg} ago</span>
							</div>
							<span class="text-xs text-gray-400">Days hidden: ${getDaySince(chat.dateAdded)}</span>
						</a>
						<div class="flex group-hover:gap-2 items-center mt-2">
							<button data-chaturl=${chat.chatURL} title="Make chat hidden" class="toggleHide -ml-2 group-hover:-ml-0 transition-transform group-hover:scale-100 size-6 scale-[0.3] opacity-40 hover:opacity-100 p-1 rounded-full
							${chat.isHidden ? "bg-emerald-500" : "bg-rose-500"}">
								<img class="size-full invisible group-hover:visible" src="../assets/visiblenot.svg"/>
							</button>
							<button data-chaturl=${chat.chatURL} title="Pin chat to the top" class="togglePin transition-transform -ml-2 group-hover:-ml-0 group-hover:scale-100 size-6 scale-[0.3] opacity-40 hover:opacity-100 p-1 rounded-full
							${chat.isPinned ? "bg-emerald-500" : "bg-rose-500"}">
								<img class="size-full invisible group-hover:visible" src="../assets/pin-off.svg" data-on="true">
							</button>
							<button data-chaturl=${chat.chatURL} title="Lock chat with password" class="toggleLock transition-transform -ml-2 group-hover:-ml-0 group-hover:scale-100 size-6 scale-[0.3] opacity-40 hover:opacity-100 p-1 rounded-full
							${chat.isLocked ? "bg-emerald-500" : "bg-rose-500"}">
								<img class="size-full invisible group-hover:visible" src="../assets/lock-off.svg" data-on="true">
							</button>
							<button data-chaturl=${chat.chatURL} title="Blur or pixelate messages" class="toggleObf transition-transform -ml-2 group-hover:-ml-0 group-hover:scale-100 size-6 scale-[0.3] opacity-40 hover:opacity-100 p-1 rounded-full
							${chat.isObfuscated ? "bg-emerald-500" : "bg-rose-500"}">
								<img class="size-full invisible group-hover:visible" src="../assets/blur-off.svg" data-on="true">
							</button>
						</div>
					</div>
				</header>
			</li>`;
	});
	return html;
}

function toggleHiddenAll() {
	document.getElementById("toggle-hiddenall").addEventListener("click", () => {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (isValidLink(tabs[0].url)) chrome.tabs.sendMessage(tabs[0].id, { message: "toggleHiddenAll" });
		});
	});
}

function getDaySince(date) {
	return (new Date(getDateNow()) - new Date(date)) / 86400000;
}

function renderChats(data) {
	chatCounter.innerText = data.messengerChats.length;
	hiddenChatsList.innerHTML = appendHiddenChats(data.messengerChats);
	toggleMethod("toggleHide", "isHidden");
	toggleMethod("toggleObf", "isObfuscated");
	toggleMethod("toggleLock", "isLocked");
	toggleMethod("togglePin", "isPinned");
}

storage.get(null, (data) => {
	themeToggle();
	toggleHiddenAll();
	updateData();
	renderChats(data);
});

storage.onChanged.addListener(() => {
	storage.get(null, (data) => {
		// Forget chats that have no feature turned on any more.
		// v2 bug, kept for now: splicing inside forEach skips the entry after each removed one.
		data.messengerChats.forEach((chat, index) => {
			if (!chat.isHidden && !chat.isPinned && !chat.isLocked && !chat.isObfuscated) {
				data.messengerChats.splice(index, 1);
			}
		});
		storage.set(data);
		renderChats(data);
	});
});
