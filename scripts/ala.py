"""Small client for the Atlas of Living Australia occurrence search.

One request at a time, 2 s apart, a few retries with backoff (none for
requests the ALA refuses outright). Responses are
saved under build/ so a failed run can be resumed without asking again.
"""
import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.ala.org.au/occurrences/occurrences/search"
UA = "aussiedatagal bogong-moths (github.com/aussiedatagal/bogong-moths)"
CACHE = Path(__file__).resolve().parent.parent / "build" / "ala"

BOGONG = 'taxon_name:"Agrotis infusa"'
INSECTS = "class:Insecta"
SYDNEY = "decimalLatitude:[-34.35 TO -33.40] AND decimalLongitude:[150.30 TO 151.40]"
CANBERRA = "decimalLatitude:[-35.50 TO -35.10] AND decimalLongitude:[148.90 TO 149.30]"
INNER_SYDNEY = "decimalLatitude:[-34.10 TO -33.55] AND decimalLongitude:[150.70 TO 151.35]"
BUTTERFLIES = "family:(Papilionidae OR Pieridae OR Nymphalidae OR Lycaenidae OR Hesperiidae)"
LEPIDOPTERA = "order:Lepidoptera"
MOTHS = f"{LEPIDOPTERA} AND -{BUTTERFLIES}"  # moths only, butterflies left out
CONFIRMED = 'identification_verification_status:"research"'

requests = 0


def search(q, fq=(), **params):
    global requests
    query = {"q": q, "pageSize": 0, "flimit": -1, **params}
    url = f"{API}?{urllib.parse.urlencode(query)}" + "".join(f"&fq={urllib.parse.quote(f)}" for f in fq)
    path = CACHE / f"{hashlib.sha1(url.encode()).hexdigest()}.json"
    if path.exists():
        return json.loads(path.read_text())
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                body = r.read()
            break
        except urllib.error.HTTPError as e:
            if 400 <= e.code < 500 and e.code != 429:
                raise SystemExit(f"ALA refused {url}: {e}")
            print(f"retrying after {e}", flush=True)
            time.sleep(10 * 2 ** attempt)
        except Exception as e:
            print(f"retrying after {e}", flush=True)
            time.sleep(10 * 2 ** attempt)
    else:
        raise SystemExit(f"ALA kept failing for {url}")
    requests += 1
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    time.sleep(2)
    return json.loads(body)


def facet(q, fq, field):
    d = search(q, fq, facets=field)
    return {r["label"]: r["count"] for f in d.get("facetResults", []) for r in f["fieldResult"]}


def records(q, fq):
    """Every record matching, 100 at a time (the API caps deep paging at 5,000)."""
    rows, start = [], 0
    while True:
        d = search(q, fq, pageSize=100, startIndex=start, facets="")
        rows += d["occurrences"]
        start += 100
        if start >= min(d["totalRecords"], 5000):
            return rows
