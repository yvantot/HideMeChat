// Renders the demo video for the store listing and YouTube from store/video/stage.html:
//
//     node store/video/render.mjs [--out store/media/demo-video.mp4] [--fps 30] [--previews <folder>]
//
// Chrome runs headless in a throwaway profile and draws each frame at 1920x1080 (the 1280x720 stage at 1.5x);
// ffmpeg turns them into an H.264 MP4. Set FFMPEG to the ffmpeg to use; by default it's the one that comes with
// Python's imageio-ffmpeg. --previews also saves a still every two seconds, for checking.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const out = path.resolve(option("--out", path.join(ROOT, "store/media/demo-video.mp4")));
const fps = Number(option("--fps", 30));
const previews = option("--previews", null);
const ffmpeg =
	process.env.FFMPEG ?? execFileSync("python", ["-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"], { encoding: "utf8" }).trim();

// Serves the repository, with the API stand-in in front of the extension's own pages.
function serve() {
	const server = http.createServer((req, res) => {
		const url = new URL(req.url, "http://localhost");
		const file = path.join(ROOT, decodeURIComponent(url.pathname));
		if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
			res.writeHead(404);
			return res.end();
		}
		let body = fs.readFileSync(file);
		if (url.pathname.startsWith("/html/") && file.endsWith(".html")) {
			body = body.toString().replace("<head>", '<head><script src="/store/video/stub.js"></script>');
		}
		res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
		res.end(body);
	});
	return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// A minimal DevTools protocol client over the browser's WebSocket.
async function connect(url) {
	const socket = new WebSocket(url);
	await new Promise((resolve, reject) => {
		socket.onopen = resolve;
		socket.onerror = reject;
	});
	let id = 0;
	const pending = new Map();
	socket.onmessage = (event) => {
		const message = JSON.parse(event.data);
		const waiting = pending.get(message.id);
		if (!waiting) return;
		pending.delete(message.id);
		if (message.error) waiting.reject(new Error(`${waiting.method}: ${message.error.message}`));
		else waiting.resolve(message.result);
	};
	const send = (method, params = {}, sessionId) =>
		new Promise((resolve, reject) => {
			pending.set(++id, { resolve, reject, method });
			socket.send(JSON.stringify({ id, method, params, sessionId }));
		});
	return { send, close: () => socket.close() };
}

async function launchChrome(profile) {
	const chrome = spawn(CHROME, [
		"--headless=new",
		"--disable-gpu",
		"--hide-scrollbars",
		"--no-first-run",
		"--no-default-browser-check",
		"--remote-debugging-port=0",
		`--user-data-dir=${profile}`,
		"about:blank",
	]);
	const portFile = path.join(profile, "DevToolsActivePort");
	for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await new Promise((r) => setTimeout(r, 100));
	const [port, browserPath] = fs.readFileSync(portFile, "utf8").trim().split("\n");
	return { chrome, url: `ws://127.0.0.1:${port}${browserPath}` };
}

async function main() {
	const server = await serve();
	const base = `http://127.0.0.1:${server.address().port}`;
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "hmc-video-"));
	const { chrome, url } = await launchChrome(profile);
	const cdp = await connect(url);
	try {
		const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
		const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
		const page = (method, params) => cdp.send(method, params, sessionId);
		const evaluate = async (expression) => (await page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;

		await page("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1.5, mobile: false });
		await page("Page.navigate", { url: `${base}/store/video/stage.html` });
		for (let i = 0; i < 300 && !(await evaluate("window.stageReady === true").catch(() => false)); i++) await new Promise((r) => setTimeout(r, 100));
		const duration = await evaluate("window.stageDuration");
		if (!duration) throw new Error("The stage didn't get ready.");

		if (previews) fs.mkdirSync(previews, { recursive: true });
		// --stills 4.5,12: only those moments, saved to the previews folder, for checking the composition.
		const stills = option("--stills", null);
		if (stills) {
			for (const t of stills.split(",").map(Number)) {
				await evaluate(`render(${t})`);
				const { data } = await page("Page.captureScreenshot", { format: "jpeg", quality: 92 });
				fs.writeFileSync(path.join(previews, `still-${t.toFixed(1)}.jpg`), Buffer.from(data, "base64"));
			}
			console.log(`duration ${duration.toFixed(1)}s, timeline ${await evaluate("JSON.stringify(at)")}`);
			return;
		}

		const frames = Math.round(duration * fps);
		fs.mkdirSync(path.dirname(out), { recursive: true });
		const encoder = spawn(ffmpeg, [
			"-y", "-loglevel", "error",
			"-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "-",
			// The frames are full-range JPEG colors; video players expect the standard (BT.709, limited range) ones.
			"-vf", "scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p",
			"-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
			"-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart",
			out,
		], { stdio: ["pipe", "inherit", "inherit"] });
		const encoded = new Promise((resolve, reject) => encoder.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)))));

		for (let frame = 0; frame < frames; frame++) {
			const t = frame / fps;
			await evaluate(`render(${t})`);
			const { data } = await page("Page.captureScreenshot", { format: "jpeg", quality: 95 });
			const image = Buffer.from(data, "base64");
			if (!encoder.stdin.write(image)) await new Promise((resolve) => encoder.stdin.once("drain", resolve));
			if (previews && frame % (fps * 2) === 0) fs.writeFileSync(path.join(previews, `t${String(Math.round(t)).padStart(2, "0")}.jpg`), image);
			if (frame % (fps * 5) === 0) console.log(`${t.toFixed(0)}s of ${duration.toFixed(1)}s`);
		}
		encoder.stdin.end();
		await encoded;
		console.log(`${out}: ${frames} frames, ${duration.toFixed(1)}s`);
	} finally {
		cdp.close();
		chrome.kill();
		server.close();
		setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 1000);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
