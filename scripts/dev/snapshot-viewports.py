"""Take screenshots of the dashboard at multiple viewports and states."""
import os
import asyncio
import json
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("HEALTHCHECK_BASE", "http://127.0.0.1:8765")
OUT = Path("/tmp/cch-shots")
OUT.mkdir(exist_ok=True)


def api(method, path, body=None):
    req = urllib.request.Request(
        BASE + path,
        method=method,
        headers={"Content-Type": "application/json"},
        data=json.dumps(body).encode() if body is not None else None,
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def reset_and_seed():
    cfg = api("GET", "/api/config")
    for p in cfg["schedule_points"]:
        api("DELETE", f"/api/schedule/{p['id']}")
    now = datetime.now(timezone.utc)
    # Mix: pending future + already-fired (will be done/failed via past detection)
    for delta in (timedelta(minutes=45), timedelta(hours=5, minutes=10),
                  timedelta(days=1, hours=2, minutes=15)):
        api("POST", "/api/schedule",
            {"scheduled_at": (now + delta).isoformat()})
    api("POST", "/api/enable")


async def main():
    reset_and_seed()
    # Try to populate history by running a manual trigger (real reclaude call ~7s)
    try:
        api("POST", "/api/trigger")
    except Exception as e:
        print(f"trigger failed (ok if reclaude not available): {e}")

    viewports = [
        ("narrow", 400, 1400),
        ("mobile", 414, 1400),
        ("tablet", 768, 1300),
        ("desktop", 1280, 1100),
    ]
    states = ["base", "config_open", "history_open"]

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        for label, w, h in viewports:
            for state in states:
                ctx = await browser.new_context(
                    viewport={"width": w, "height": h},
                    device_scale_factor=2,
                )
                page = await ctx.new_page()
                await page.goto(BASE, wait_until="networkidle")
                await page.wait_for_selector("text=Claude Code", timeout=5000)
                await page.wait_for_timeout(600)

                if state == "config_open":
                    btn = page.get_by_role("button", name="展开配置")
                    if await btn.count():
                        await btn.first.click()
                        await page.wait_for_timeout(200)
                elif state == "history_open":
                    # find first history row button and click it
                    btn = page.locator("li button").last
                    try:
                        await btn.click(timeout=1500)
                        await page.wait_for_timeout(200)
                    except Exception:
                        pass

                out = OUT / f"{label}_{state}_{w}x{h}.png"
                await page.screenshot(path=str(out), full_page=True)
                print(f"saved {out.name}")
                await ctx.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
