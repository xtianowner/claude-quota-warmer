"""Capture the header region across {ZH,EN} × {Off,On} toggle states
import os
at several narrow viewports, plus a full-page snapshot of each, to find
any layout shift / squeeze when the master toggle flips."""
import asyncio
import json
import urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("HEALTHCHECK_BASE", "http://127.0.0.1:8765")
OUT = Path("/tmp/cch-shots/header")
OUT.mkdir(parents=True, exist_ok=True)


def api(method, path, body=None):
    req = urllib.request.Request(
        BASE + path,
        method=method,
        headers={"Content-Type": "application/json"},
        data=json.dumps(body).encode() if body is not None else None,
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


async def main():
    # ensure starting from a known state (disabled)
    api("POST", "/api/disable")

    viewports = [
        ("ultra", 320, 700),
        ("narrow", 400, 700),
        ("mobile", 414, 700),
        ("snug", 600, 700),
        ("sm", 640, 600),
        ("md", 768, 600),
    ]

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        for label, w, h in viewports:
            for locale in ("zh", "en"):
                for state in ("off", "on"):
                    api("POST", f"/api/{'enable' if state == 'on' else 'disable'}")
                    ctx = await browser.new_context(
                        viewport={"width": w, "height": h},
                        device_scale_factor=2,
                    )
                    page = await ctx.new_page()
                    # preset locale via localStorage before load
                    await page.add_init_script(
                        f"window.localStorage.setItem('cch.locale', '{locale}');"
                    )
                    await page.goto(BASE, wait_until="networkidle")
                    await page.wait_for_selector("header", timeout=4000)
                    await page.wait_for_timeout(400)

                    # Crop to header region (top ~200px)
                    out = OUT / f"{label}_{w}_{locale}_{state}.png"
                    await page.screenshot(
                        path=str(out),
                        clip={"x": 0, "y": 0, "width": w, "height": 220},
                    )
                    print(f"saved {out.name}")
                    await ctx.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
