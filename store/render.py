"""Renders Hide Me Chat's Chrome Web Store images from the pages in store/source/ with headless Chrome.

    python store/render.py                   # the store images, from the icons in assets/
    python store/render.py --logo logo.svg   # first redraws the extension's icons in assets/ from an SVG logo

Writes store/media/: icon-128.png, screenshot-1.png to screenshot-5.png (1280x800), promo-small.png (440x280)
and promo-marquee.png (1400x560). Screenshots and tiles are saved without transparency. Needs Chrome and
Pillow. Chrome runs headless in a throwaway profile, so it never touches the browser you use.
"""
import argparse
import http.server
import pathlib
import shutil
import subprocess
import tempfile
import threading

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
MEDIA = ROOT / "store" / "media"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ICON_SIZES = [16, 32, 48, 128, 256]
PAGES = [
    ("screenshot-1", 1280, 800),
    ("screenshot-2", 1280, 800),
    ("screenshot-3", 1280, 800),
    ("screenshot-4", 1280, 800),
    ("screenshot-5", 1280, 800),
    ("promo-small", 440, 280),
    ("promo-marquee", 1400, 560),
]


class Handler(http.server.SimpleHTTPRequestHandler):
    """Serves the repository, with the API stand-in (store/source/stub.js) in front of the extension's pages."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path.startswith("/html/") and path.endswith(".html"):
            page = (ROOT / path.lstrip("/")).read_text(encoding="utf-8")
            body = page.replace("<head>", '<head><script src="/store/source/stub.js"></script>', 1).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, *args):
        pass


def shoot(url, out, width, height, transparent=False):
    """Saves a screenshot of `url` at width x height. Small images are drawn in a larger window and cropped, as
    headless Chrome won't make a window smaller than a few hundred pixels."""
    window = (max(width, 800), max(height, 600))
    with tempfile.TemporaryDirectory() as profile:
        args = [
            CHROME,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--no-first-run",
            "--no-default-browser-check",
            "--force-device-scale-factor=1",
            f"--user-data-dir={profile}",
            f"--window-size={window[0]},{window[1]}",
            "--virtual-time-budget=4000",
            f"--screenshot={out}",
        ]
        if transparent:
            args.append("--default-background-color=00000000")
        subprocess.run(args + [url], check=True, timeout=120, capture_output=True)
    image = Image.open(out)
    if image.size != window:
        raise SystemExit(f"{out} came out {image.size}, not {window[0]}x{window[1]}")
    image = image.crop((0, 0, width, height))
    image.save(out)
    return image


def draw_icons(base, logo):
    """Redraws assets/hidechat_icon*.png from an SVG logo, and keeps the SVG as assets/logo.svg."""
    if logo != (ASSETS / "logo.svg").resolve():
        shutil.copyfile(logo, ASSETS / "logo.svg")
    for size in ICON_SIZES:
        out = ASSETS / f"hidechat_icon{size}.png"
        shoot(f"{base}/store/source/icon.html?size={size}", out, size, size, transparent=True)
        print(f"  {out.relative_to(ROOT)}")


def store_icon(base):
    """128x128 with room around the artwork, as the store asks: drawn from the SVG logo, or else from the
    largest PNG icon scaled into the middle."""
    out = MEDIA / "icon-128.png"
    if (ASSETS / "logo.svg").exists():
        shoot(f"{base}/store/source/icon.html?size=128", out, 128, 128, transparent=True)
    else:
        art = Image.open(ASSETS / "hidechat_icon256.png").convert("RGBA").resize((112, 112), Image.LANCZOS)
        icon = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        icon.alpha_composite(art, (8, 8))
        icon.save(out)
    print(f"  {out.relative_to(ROOT)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--logo", type=pathlib.Path, help="an SVG logo to redraw the extension's icons from first")
    options = parser.parse_args()

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    MEDIA.mkdir(parents=True, exist_ok=True)
    try:
        if options.logo:
            print("Icons:")
            draw_icons(base, options.logo.resolve())
        print("Store images:")
        store_icon(base)
        for name, width, height in PAGES:
            out = MEDIA / f"{name}.png"
            shoot(f"{base}/store/source/{name}.html", out, width, height).convert("RGB").save(out)
            print(f"  {out.relative_to(ROOT)}")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
