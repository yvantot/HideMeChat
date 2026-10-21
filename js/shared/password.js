// Password handling shared by the background, the popup and settings pages, and the lock screen.
// The password is stored as a salted PBKDF2-SHA256 hash in preferences.password, never as text.
const PASSWORD_MIN_LENGTH = 5;
const PASSWORD_ITERATIONS = 600000;

function bytesToBase64(bytes) {
	let binary = "";
	bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
	return btoa(binary);
}

function base64ToBytes(base64) {
	return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

// Like v2, surrounding spaces don't count.
async function derivePasswordHash(password, salt, iterations) {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password.trim()), "PBKDF2", false, [
		"deriveBits",
	]);
	const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
	return bytesToBase64(new Uint8Array(bits));
}

async function hashPassword(password) {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS);
	return { salt: bytesToBase64(salt), hash, iterations: PASSWORD_ITERATIONS };
}

async function verifyPassword(password, record) {
	if (!record) return false;
	return (await derivePasswordHash(password, base64ToBytes(record.salt), record.iterations)) === record.hash;
}

function isValidNewPassword(password) {
	return password.trim().length >= PASSWORD_MIN_LENGTH;
}

// v2 kept the password as plain text in preferences.userPassword. Replaces it with a hash and returns whether
// `data` changed, so the caller can save it.
async function upgradeLegacyPassword(data) {
	const legacy = data?.preferences?.userPassword;
	if (legacy === undefined) return false;
	if (legacy) data.preferences.password = await hashPassword(legacy);
	delete data.preferences.userPassword;
	return true;
}
