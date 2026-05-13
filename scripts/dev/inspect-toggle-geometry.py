"""Measure DOM geometry of the toggle in OFF vs ON state."""
import os
import asyncio
import json
import urllib.request
from playwright.async_api import async_playwright

BASE = os.environ.get("HEALTHCHECK_BASE", "http://127.0.0.1:8765")


def api(method, path, body=None):
    req = urllib.request.Request(
        BASE + path,
        method=method,
        headers={"Content-Type": "application/json"},
        data=json.dumps(body).encode() if body is not None else None,
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


async def measure(page):
    return await page.evaluate("""() => {
      // Find the master toggle button: the [aria-pressed] one (Toggle uses that)
      const btn = document.querySelector('button[aria-pressed]');
      if (!btn) return null;
      const r = (el) => {
        if (!el) return null;
        const b = el.getBoundingClientRect();
        const c = window.getComputedStyle(el);
        return {
          w: b.width, h: b.height, x: b.x, y: b.y,
          pl: c.paddingLeft, pr: c.paddingRight,
          ml: c.marginLeft, mr: c.marginRight,
          bw: c.borderLeftWidth + '/' + c.borderRightWidth,
          bg: c.backgroundColor,
          fs: c.fontSize,
        };
      };
      const pill = btn.querySelector(':scope > span:nth-of-type(1)');
      const knob = pill ? pill.querySelector('span') : null;
      const label = btn.querySelector(':scope > span:nth-of-type(2)');
      return {
        btn: r(btn),
        pill: r(pill),
        knob: r(knob),
        label: r(label),
        labelText: label ? label.textContent : null,
        ariaPressed: btn.getAttribute('aria-pressed'),
      };
    }""")


async def main():
    api("POST", "/api/disable")
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        for label, w in [("snug", 600), ("md", 768)]:
            ctx = await browser.new_context(
                viewport={"width": w, "height": 700},
                device_scale_factor=2,
            )
            page = await ctx.new_page()
            await page.add_init_script("window.localStorage.setItem('cch.locale', 'zh');")
            await page.goto(BASE, wait_until="networkidle")
            await page.wait_for_selector("button[aria-pressed]", timeout=4000)

            off = await measure(page)
            # click toggle
            await page.click("button[aria-pressed='false']")
            await page.wait_for_timeout(500)
            on = await measure(page)

            print(f"\n=== {label} {w}px ===")
            print("OFF:", json.dumps(off, ensure_ascii=False, indent=2))
            print("ON :", json.dumps(on, ensure_ascii=False, indent=2))

            await ctx.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
