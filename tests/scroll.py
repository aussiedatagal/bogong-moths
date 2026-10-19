"""Scroll through the page in small steps and check how it behaves.

    python3 tests/scroll.py [URL]   (default http://localhost:8000/)

At phone and desktop sizes it checks that the replay map and its card stay
pinned and fully on screen while the days play, that the prompt fades on the
last day and the pinned part leaves soon after, that every chart has drawn
with no text spilling past its top edge, that flicking through lands each
chart page at the top of the screen and still reaches the end of the page, and
that there are no script errors or sideways scrolling. Needs Playwright.
"""
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/"
SIZES = [(390, 844), (390, 700), (360, 640), (412, 915), (1024, 700), (1280, 900)]
STEP = 10  # pixels per scroll

REPLAY = """() => {
  const box = el => { const r = el.getBoundingClientRect(); return [r.top, r.bottom]; };
  const s = document.getElementById('replay');
  return {
    pin: box(s.querySelector('.pin')),
    card: box(s.querySelector('.card')),
    graphic: box(s.querySelector('.graphic')),
    prompt: parseFloat(getComputedStyle(s.querySelector('.scroll-on')).opacity),
    done: s.classList.contains('is-done'),
  };
}"""

# How far the highest bit of text in each chart pokes above the chart's top edge
CHARTS = """() => [...document.querySelectorAll('.graphic')].map(g => {
  const top = g.getBoundingClientRect().top;
  const svg = g.querySelector('svg, canvas');
  const texts = [...g.querySelectorAll('text')].filter(t => t.textContent && t.getBBox().width);
  return {
    state: `${g.dataset.chart}:${g.dataset.state}`,
    height: svg ? svg.getBoundingClientRect().height : 0,
    spill: Math.max(0, ...texts.map(t => top - t.getBoundingClientRect().top)),
  };
})"""


def settle(page):
    page.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")


def check_replay(page, w, h, problems):
    """Map and card stay whole on screen while pinned, the prompt fades on the
    last day, and the pinned part starts leaving soon after."""
    top, height = page.evaluate("(() => { const r = document.getElementById('replay').getBoundingClientRect(); return [r.top + scrollY, r.height]; })()")
    seen_on, done_at, left_at, clipped = False, None, None, 0
    for y in range(int(top - h), int(top + height), STEP):
        page.evaluate(f"scrollTo(0, {y})")
        settle(page)
        m = page.evaluate(REPLAY)
        pinned = abs(m["pin"][0]) < 0.5
        if pinned and (m["card"][1] > h + 0.5 or m["graphic"][0] < 0):
            clipped += 1
        seen_on |= m["prompt"] > 0.5 and not m["done"]
        if m["done"] and done_at is None:
            done_at = y
        if done_at is not None and left_at is None and m["pin"][0] < -0.5:
            left_at = y
    label = f"{w}x{h} replay"
    if clipped:
        problems.append(f"{label}: map or card off screen while pinned at {clipped} positions")
    if not (seen_on and done_at):
        problems.append(f"{label}: prompt shown {seen_on}, reached the last day {done_at is not None}")
    elif left_at is None or left_at - done_at > 0.15 * h:
        problems.append(f"{label}: after the last day it stayed pinned for {None if left_at is None else left_at - done_at}px")


def check_charts(page, w, h, problems):
    for c in page.evaluate(CHARTS):
        if c["height"] < 150:
            problems.append(f"{w}x{h} {c['state']}: chart only {round(c['height'])}px tall")
        if c["spill"] > 1:
            problems.append(f"{w}x{h} {c['state']}: text pokes {round(c['spill'])}px above the chart")


def check_snap(page, w, h, problems):
    """Flick down the page with the mouse wheel and see which pages land at the top."""
    page.evaluate("scrollTo(0, 0)")
    page.mouse.move(w / 2, h / 2)
    landed, last = set(), -1
    for _ in range(60):
        page.mouse.wheel(0, 500)
        page.wait_for_timeout(600)
        y = page.evaluate("scrollY")
        landed |= set(page.evaluate("[...document.querySelectorAll('.panel')].map((p, i) => Math.abs(p.getBoundingClientRect().top) < 2 ? i : -1).filter(i => i >= 0)"))
        if y == last:
            break
        last = y
    panels = page.evaluate("document.querySelectorAll('.panel').length")
    if len(landed) < panels:
        problems.append(f"{w}x{h} snap: only chart pages {sorted(landed)} of {panels} landed at the top")
    if last + h < page.evaluate("document.documentElement.scrollHeight") - 2:
        problems.append(f"{w}x{h} snap: stuck at {last}px before the end of the page")
    # the sweeps below scroll a few pixels at a time, which snapping would undo
    page.add_style_tag(content="html { scroll-snap-type: none !important; }")


def main():
    problems = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for w, h in SIZES:
            page = browser.new_page(viewport={"width": w, "height": h}, is_mobile=w < 900, has_touch=w < 900)
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: m.type == "error" and errors.append(m.text))
            page.goto(URL, wait_until="networkidle")
            page.wait_for_timeout(1000)
            check_snap(page, w, h, problems)
            check_replay(page, w, h, problems)
            check_charts(page, w, h, problems)
            if page.evaluate("document.documentElement.scrollWidth") > w:
                problems.append(f"{w}x{h}: page scrolls sideways")
            if errors:
                problems.append(f"{w}x{h}: errors {errors}")
            print(f"{w}x{h} checked", flush=True)
            page.close()
        browser.close()
    for line in problems:
        print("FAIL", line)
    print("ok" if not problems else f"{len(problems)} problems")
    sys.exit(1 if problems else 0)


main()
