"""Fail if the written claims no longer match the data.

The numbers are filled in by fill_text.py. This checks the words around them:
the headline ratios and which areas are named as standing out on the map.
If one fails, the page needs a human to rewrite that sentence before it goes out.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
f = json.loads((ROOT / "data" / "facts.json").read_text())
surface = json.loads((ROOT / "data" / "surface.json").read_text())


def share_at(lat, lon):
    """Bogongs per 100 moths on the smoothed map at the nearest grid point."""
    west, north, step = surface["extent"][0], surface["extent"][3], surface["step"]
    i = round((north - lat) / step) * surface["cols"] + round((lon - west) / step)
    return surface["share"][i] or 0


brightest = [share_at(-33.71, 150.31), share_at(-34.42, 150.89)]  # Katoomba, Wollongong
behind = [share_at(-33.87, 151.21), share_at(-34.88, 150.60)]  # Sydney, Nowra

claims = {
    "bars: this spring's share is still a massive increase on every earlier spring": f["oneIn26"] * 5 <= f["sydBaseFewerThan"],
    "bars: fewer than 1 in N works as a rounded figure": f["sydBaseFewerThan"] >= 10,
    "Australia: the jump holds with butterflies counted in and confirmed IDs only":
        float(f["ausWithButterflies26"]) > 5 * float(f["ausWithButterfliesBase"]) and float(f["ausConfirmed26"]) > 5 * float(f["ausConfirmedBase"]),
    "share map: Blue Mountains and Illawarra brightest, Sydney and the South Coast close behind":
        min(brightest) > max(behind) and min(behind) >= min(brightest) - 10,
    "Sydney: the jump holds with butterflies counted in and confirmed IDs only":
        float(f["withButterflies26"]) > 5 * float(f["withButterflies25"]) and float(f["confirmed26"]) > 5 * float(f["confirmed25"]),
}

failed = [c for c, ok in claims.items() if not ok]
for c in claims:
    print("ok  " if c not in failed else "FAIL", c)
sys.exit(1 if failed else 0)
