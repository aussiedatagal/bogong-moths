"""Scroll through the page in small steps and check how the scrolly behaves.

    python3 tests/scroll.py [URL]   (default http://localhost:8000/)

At phone and desktop sizes it checks that cards never cover a graphic, that
the last card in each section is held fully on screen under its graphic for a
while, that the graphic and that card then leave together, that every step
becomes active, that the replay prompt fades on the last day, and that there
are no script errors or sideways scrolling. Needs Playwright.
"""
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/"
SIZES = [(390, 844), (390, 700), (360, 640), (412, 915), (1024, 700), (1280, 900)]
STEP = 10  # pixels per scroll

MEASURE = """id => {
  const s = document.getElementById(id);
  const box = el => { const r = el.getBoundingClientRect(); return [r.top, r.bottom, r.left, r.right]; };
  const steps = [...s.querySelectorAll('.step')];
  return {
    sticky: box(s.querySelector('.sticky')),
    graphic: box(s.querySelector('.graphic')),
    cards: steps.map(st => box(st.querySelector('.card') || st)),
    active: steps.map(st => st.classList.contains('is-active')),
    states: steps.map(st => st.dataset.state),
  };
}"""


def settle(page):
    page.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")


def check_section(page, sid, w, h, problems):
    phone = w < 900
    top = page.evaluate(f"document.getElementById('{sid}').getBoundingClientRect().top + scrollY")
    bottom = page.evaluate(f"document.getElementById('{sid}').getBoundingClientRect().bottom + scrollY")
    held, seen_active, gaps, overlaps = 0, set(), [], 0
    released = None
    for y in range(int(top - h), int(bottom + h), STEP):
        page.evaluate(f"scrollTo(0, {y})")
        settle(page)
        m = page.evaluate(MEASURE, sid)
        g_top, g_bot = m["graphic"][0], m["graphic"][1]
        last = m["cards"][-1]
        pinned = abs(m["sticky"][0]) < 0.5
        seen_active |= {m["states"][i] for i, a in enumerate(m["active"]) if a and m["sticky"][1] > 0}
        # earlier cards pass over the graphic on their way up; the last one stops below it
        if phone and g_bot > 0 and last[1] > 0 and last[0] < g_bot - 1 and last[1] > g_top + 1:
            overlaps += 1
        fully = last[0] >= 0 and last[1] <= h + 0.5
        if pinned and fully and m["active"][-1] and (not phone or last[0] >= g_bot - 1):
            held += STEP
        if released is None and m["sticky"][0] < -0.5:
            released = (y, last, m["sticky"][0])
            if not fully:
                problems.append(f"{w}x{h} #{sid}: graphic starts leaving before the last card is fully on screen")
        if phone and released and m["sticky"][1] > 0:
            gaps.append(round(last[0] - m["sticky"][0]))
    label = f"{w}x{h} #{sid}"
    if overlaps:
        problems.append(f"{label}: the last card covered the graphic at {overlaps} scroll positions")
    if held < 0.25 * h:
        problems.append(f"{label}: last card held under the graphic for only {held}px of scrolling")
    if phone and gaps and max(gaps) - min(gaps) > 2:
        problems.append(f"{label}: last card and graphic drift apart while leaving ({min(gaps)} to {max(gaps)}px)")
    states = set(page.evaluate(MEASURE, sid)["states"])
    if states - seen_active:
        problems.append(f"{label}: steps never became active: {sorted(states - seen_active)}")
    return held


def check_replay(page, w, h, problems):
    """The prompt shows, fades on the last day, and the card moves on soon after."""
    top, height = page.evaluate("(() => { const r = document.querySelector('.step[data-scrub]').getBoundingClientRect(); return [r.top + scrollY, r.height]; })()")
    seen_on, done_at, moved_at, held_top = False, None, None, None
    for y in range(int(top - h), int(top + height), STEP):
        page.evaluate(f"scrollTo(0, {y})")
        settle(page)
        op = float(page.evaluate("getComputedStyle(document.querySelector('.scroll-on')).opacity"))
        last_day = page.evaluate("document.querySelector('.step[data-scrub]').classList.contains('is-done')")
        card_top = page.evaluate("document.querySelector('.step[data-scrub] .card').getBoundingClientRect().top")
        seen_on |= op > 0.5 and not last_day
        if last_day and done_at is None:
            done_at, held_top = y, card_top
        if done_at is not None and moved_at is None and card_top < held_top - 1:
            moved_at = y
    if not (seen_on and done_at):
        problems.append(f"{w}x{h}: replay prompt shown {seen_on}, reached the last day {done_at is not None}")
    elif moved_at is None or moved_at - done_at > 0.15 * h:
        problems.append(f"{w}x{h}: after the last day the replay card sat still for {None if moved_at is None else moved_at - done_at}px")


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
            held = [check_section(page, sid, w, h, problems) for sid in ("years", "map")]
            check_replay(page, w, h, problems)
            if page.evaluate("document.documentElement.scrollWidth") > w:
                problems.append(f"{w}x{h}: page scrolls sideways")
            if errors:
                problems.append(f"{w}x{h}: errors {errors}")
            print(f"{w}x{h}: last card held for {held[0]}px (bars), {held[1]}px (map)", flush=True)
            page.close()
        browser.close()
    for line in problems:
        print("FAIL", line)
    print("ok" if not problems else f"{len(problems)} problems")
    sys.exit(1 if problems else 0)


main()
