"""Fetch Bogong and moth counts from the ALA and write the page's data files.

    python3 scripts/build.py

Writes data/years.json, sightings.json, regions.json, surface.json and facts.json.
The map outlines, postcodes and wind are fixed and aren't rebuilt here.
"""
import datetime as dt
import json
import math
from collections import Counter
from pathlib import Path
from zoneinfo import ZoneInfo

import ala
from surface import build_surface

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
TZ = ZoneInfo("Australia/Sydney")
YEAR = 2026  # the season this page is about
BASE_FROM = 2020  # earlier springs to compare with, up to last year
AUS_FROM = 2018  # the Australia-wide check reaches back further
START = dt.date(YEAR, 9, 1)
MAP = (138.0, -39.6, 154.0, -26.0)  # west, south, east, north
# Same days every year: 1 September to the last full day of data. Set in build_facts.
SEASON = "month:9"
MIN_PHOTOS = 30


def save(name, obj):
    (DATA / name).write_text(json.dumps(obj, separators=(",", ":")))


def dates(a, b):
    return f"occurrence_date:[{a}T00:00:00Z TO {b}T23:59:59Z]"


def in_map(lon, lat):
    return MAP[0] < lon < MAP[2] and MAP[1] < lat < MAP[3]


def per100(b, m):
    return 100 * b / m if m else 0


def one_in(share):
    n = 100 / share
    return int(round(n / 50) * 50) if n > 100 else round(n)


def fmt(n):
    return f"{n:,}"


def season_records(today):
    """This season's Bogong records from 1 September, ten days per request so no window passes 5,000."""
    rows, day = {}, START
    while day <= today:
        end = min(day + dt.timedelta(days=9), today)
        for r in ala.records(ala.BOGONG, [dates(day, end)]):
            rows[r["uuid"]] = r
        day = end + dt.timedelta(days=1)
    return list(rows.values())


def build_sightings(rows):
    out = []
    for r in rows:
        if not r.get("eventDate") or "decimalLatitude" not in r:
            continue
        day = dt.datetime.fromtimestamp(r["eventDate"] / 1000, TZ).date()
        out.append((day, r["decimalLongitude"], r["decimalLatitude"], (r.get("recordedBy") or ["?"])[0]))
    # the newest day is still filling up as people upload, so stop the day before
    last = max(d for d, *_ in out) - dt.timedelta(days=1)
    days = (last - START).days + 1
    # rounded to about 1 km so no point marks a single house
    pts = sorted(([round(lon, 2), round(lat, 2), (d - START).days] for d, lon, lat, _ in out
                  if START <= d <= last and in_map(lon, lat)), key=lambda p: p[2])
    daily = Counter(p[2] for p in pts)
    save("sightings.json", {"start": START.isoformat(), "days": days, "points": pts,
                            "daily": [daily[d] for d in range(days)]})
    sydney = [o for d, lon, lat, o in out if START <= d <= last
              and 150.30 <= lon <= 151.40 and -34.35 <= lat <= -33.40]
    people = Counter(sydney)
    return last, {
        "sydneyRecords": fmt(len(sydney)),
        "sydneyPeople": fmt(len(people)),
        "top10Share": f"{round(100 * sum(c for _, c in people.most_common(10)) / len(sydney))}%",
    }


def september_years(fq, first):
    b = facet_year(ala.BOGONG, [SEASON] + fq)
    m = facet_year(ala.MOTHS, [SEASON] + fq)
    return {y: {"year": y, "bogong": b.get(y, 0), "moths": m.get(y, 0)} for y in range(first, YEAR + 1)}


def build_years():
    years = september_years([ala.SYDNEY], BASE_FROM)
    save("years.json", list(years.values()))
    return years


def canberra_shares():
    """Canberra is on the usual route, so a jump there means more moths, not just moths off course."""
    years = september_years([ala.CANBERRA], YEAR - 1)
    return {f"canberra{y % 100}": short(per100(years[y]["bogong"], years[y]["moths"])) for y in (YEAR - 1, YEAR)}


def australia_checks():
    """Australia: this season's share and the highest share in earlier years from AUS_FROM, for moths only,
    with butterflies counted in, and for confirmed identifications only."""
    def shares(moths, fq=()):
        b = facet_year(ala.BOGONG, [SEASON, *fq])
        return {y: per100(b.get(y, 0), m) for y, m in moths.items() if AUS_FROM <= y <= YEAR}
    out = {}
    for tag, s in [("all", shares(facet_year(ala.MOTHS, [SEASON]))),
                   ("withButterflies", shares(facet_year(ala.LEPIDOPTERA, [SEASON]))),
                   ("confirmed", shares(facet_year(ala.MOTHS, [SEASON, ala.CONFIRMED]), [ala.CONFIRMED]))]:
        out[tag] = (s[YEAR], max(v for y, v in s.items() if y < YEAR))
    return out


def facet_year(q, fq):
    return {int(k): v for k, v in ala.facet(q, fq, "year").items() if k.isdigit()}


def town_name(lon, lat, towns):
    inside = [t for t in towns if abs(t[1] - lon) <= 0.5 and abs(t[2] - lat) <= 0.5]
    if inside:
        return max(inside, key=lambda t: t[3])[0]
    near = min(towns, key=lambda t: (t[1] - lon) ** 2 + (t[2] - lat) ** 2)
    return f"near {near[0]}"


def build_regions():
    """Share per 1 degree square, this season against the same days in earlier years.

    oneLogger marks squares where one person logged more than half the Bogongs.
    """
    towns = json.loads((ROOT / "scripts" / "towns.json").read_text())
    b = ala.facet(ala.BOGONG, [f"year:{YEAR}", SEASON], "point-1")
    m = ala.facet(ala.MOTHS, [f"year:{YEAR}", SEASON], "point-1")
    bb = ala.facet(ala.BOGONG, [f"year:[{BASE_FROM} TO {YEAR - 1}]", SEASON], "point-1")
    mb = ala.facet(ala.MOTHS, [f"year:[{BASE_FROM} TO {YEAR - 1}]", SEASON], "point-1")
    cells = []
    for key, moths in m.items():
        lat, lon = map(float, key.split(","))
        if not in_map(lon, lat):
            continue
        cell = {"key": key, "lat": lat, "lon": lon, "name": town_name(lon, lat, towns), "moths": moths,
                "bogong": b.get(key, 0), "baseMoths": mb.get(key, 0), "baseBogong": bb.get(key, 0),
                "people": 0, "oneLogger": False}
        if moths >= MIN_PHOTOS and cell["bogong"]:
            who = ala.facet(ala.BOGONG, [f"year:{YEAR}", SEASON, f'point-1:"{key}"'], "collector")
            cell["people"] = len(who)
            cell["oneLogger"] = cell["bogong"] >= 5 and max(who.values()) > cell["bogong"] / 2
            cell["topLogger"] = max(who, key=who.get)
            cell["top"] = who[cell["topLogger"]]
        cells.append(cell)
    save("regions.json", [{k: v for k, v in c.items() if k not in ("key", "top", "topLogger")} for c in cells])
    return cells


def method_checks(today):
    """The robustness numbers quoted in the method section."""
    def share(q, fq, year, minus=None):
        b = facet_year(ala.BOGONG, fq).get(year, 0)
        m = facet_year(q, fq).get(year, 0)
        if minus:
            m -= facet_year(ala.MOTHS, fq + [minus]).get(year, 0)
        return per100(b, m)

    sep = [ala.SYDNEY, SEASON]
    facts = {}
    for year, tag in [(YEAR, "26"), (YEAR - 1, "25")]:
        facts[f"withButterflies{tag}"] = share(ala.LEPIDOPTERA, sep, year)
        facts[f"insects{tag}"] = share(ala.INSECTS, sep, year)
        b = facet_year(ala.BOGONG, sep + [ala.CONFIRMED]).get(year, 0)
        m = facet_year(ala.MOTHS, sep + [ala.CONFIRMED]).get(year, 0)
        facts[f"confirmed{tag}"] = per100(b, m)
        facts[f"inner{tag}"] = share(ala.MOTHS, [ala.INNER_SYDNEY, SEASON], year)
        window = dates(f"{year}-09-01", f"{year}-09-24")
        facts[f"early{tag}"] = share(ala.MOTHS, [ala.SYDNEY, window], year)
    total = ala.search(ala.BOGONG, [f"year:{YEAR}"])["totalRecords"]
    inat = ala.facet(ala.BOGONG, [f"year:{YEAR}"], "data_resource").get("iNaturalist Australia", 0)
    pending = ala.facet(ala.BOGONG, [ala.SYDNEY, SEASON, f"year:{YEAR}"], "identification_verification_status")
    facts["needsId"] = round(100 * pending.get("needs_id", 0) / max(1, sum(pending.values())))
    return facts, total, inat


def short(v):
    return f"{v:.1f}" if v < 10 else f"{round(v)}"


def season_window(last):
    """1 September to the same day as `last`, in every year from AUS_FROM."""
    spans = (dates(f"{y}-09-01", f"{y}-{last:%m-%d}") for y in range(AUS_FROM, YEAR + 1))
    return "(" + " OR ".join(spans) + ")"


def build_facts(today):
    global SEASON
    rows = season_records(today)
    last, sydney = build_sightings(rows)
    SEASON = season_window(last)
    years = build_years()
    aus = australia_checks()
    cells = build_regions()
    leave_out = [(c["key"], c["topLogger"]) for c in cells if c["oneLogger"]]
    save("surface.json", build_surface(MAP, [f"year:{YEAR}", SEASON], leave_out))
    checks, total, inat = method_checks(today)

    y20, y25, y26 = years[BASE_FROM], years[YEAR - 1], years[YEAR]
    broad = sorted((c for c in cells if c["moths"] >= 100 and c["people"] >= 30 and not c["oneLogger"]),
                   key=lambda c: -per100(c["bogong"], c["moths"]))
    top = max((c for c in cells if c["moths"] >= 100), key=lambda c: per100(c["bogong"], c["moths"]))
    base = [c for c in cells if c["baseMoths"] >= MIN_PHOTOS]
    melbourne = next(c for c in cells if c["name"] == "Melbourne")
    # the top square's share without its busiest Bogong logger, moths and all
    key = f'{int(top["lat"])},{int(top["lon"])}'
    their_moths = ala.facet(ala.MOTHS, [f"year:{YEAR}", SEASON, f'point-1:"{key}"'], "collector").get(top.get("topLogger"), 0)

    facts = {
        "dataTo": f"{last.day} {last:%B}",
        "year": YEAR, "baseFrom": BASE_FROM, "baseTo": YEAR - 1,
        "fetched": f"{today.day} {today:%B %Y}",
        **canberra_shares(),
        "sydBaseOneIn": math.floor(100 / max(per100(y["bogong"], y["moths"]) for y in years.values() if y["year"] < YEAR)),
        "ausShare26": short(aus["all"][0]), "ausBaseMax": short(aus["all"][1]),
        "ausWithButterflies26": short(aus["withButterflies"][0]), "ausWithButterfliesBase": short(aus["withButterflies"][1]),
        "ausConfirmed26": short(aus["confirmed"][0]), "ausConfirmedBase": short(aus["confirmed"][1]),
        "sydSep26": fmt(y26["bogong"]), "sydSep25": fmt(y25["bogong"]),
        "moths20": fmt(y20["moths"]), "moths25": fmt(y25["moths"]), "moths26": fmt(y26["moths"]),
        "share26": short(per100(y26["bogong"], y26["moths"])), "share25": short(per100(y25["bogong"], y25["moths"])),
        "oneIn26": one_in(per100(y26["bogong"], y26["moths"])), "oneIn25": one_in(per100(y25["bogong"], y25["moths"])),
        "earlyOneIn26": one_in(checks["early26"]), "earlyOneIn25": one_in(checks["early25"]),
        "early26": short(checks["early26"]), "early25": short(checks["early25"]),
        "withButterflies26": short(checks["withButterflies26"]), "withButterflies25": short(checks["withButterflies25"]),
        "insects26": short(checks["insects26"]), "insects25": short(checks["insects25"]),
        "confirmed26": short(checks["confirmed26"]), "confirmed25": short(checks["confirmed25"]),
        "inner26": short(checks["inner26"]), "inner25": short(checks["inner25"]),
        "needsId": f"{checks['needsId']}%",
        "bogong2026": fmt(total), "inat2026": fmt(inat),
        "topBroad": [c["name"] for c in broad[:2]],
        "topBroadShare": [round(per100(c["bogong"], c["moths"])) for c in broad[:2]],
        "topBroadPeople": [c["people"] for c in broad[:2]],
        "melbourne": round(per100(melbourne["bogong"], melbourne["moths"])),
        "baseUnder": sum(1 for c in base if per100(c["baseBogong"], c["baseMoths"]) < 1),
        "baseTotal": len(base),
        "topName": top["name"], "topOneLogger": top["oneLogger"],
        "topShare": round(per100(top["bogong"], top["moths"])),
        "topByOne": top.get("top", 0), "topBogong": top["bogong"],
        "oneLoggerAreas": len(leave_out),
        "topWithout": round(per100(top["bogong"] - top.get("top", 0), top["moths"] - their_moths)),
        **sydney,
    }
    # rounded down to a tidy number for "fewer than 1 in N"
    facts["sydBaseFewerThan"] = 10 * (facts["sydBaseOneIn"] // 10)
    save("facts.json", facts)
    return facts


if __name__ == "__main__":
    today = dt.datetime.now(TZ).date()
    build_facts(today)
    print(f"done, {ala.requests} new requests to the ALA")
