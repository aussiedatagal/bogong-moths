"""Write the numbers from data/facts.json into the page text.

Every <span data-fact="key"> (or "key.0" for a list) in index.html gets the
current value. Run after build.py.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
facts = json.loads((ROOT / "data" / "facts.json").read_text())


def value(match):
    key, _, index = match.group(2).partition(".")
    v = facts[key][int(index)] if index else facts[key]
    return f"{match.group(1)}{v}</span>"


page = ROOT / "index.html"
html = page.read_text()
page.write_text(re.sub(r'(<span[^>]*data-fact="([\w.]+)"[^>]*>)[^<]*</span>', value, html))
