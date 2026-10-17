"""Smoothed Bogong share for the map, this season.

Counts come from the ALA on a 0.1 degree grid (about 10 km). Each count is
spread over its neighbours with a Gaussian about 30 km wide, for Bogongs and
for all moths separately, and the share is the ratio of the two. The weight
(smoothed moth photos nearby) lets the page fade out places with few photos.

Where one person logged most of an area's Bogongs (build.py flags these), their
records are taken out of both counts, so one keen moth-lighter can't light up
a region on their own.
"""
import math

import ala

STEP = 0.1
SIGMA = 0.3  # degrees of latitude, about 33 km
REACH = 3 * SIGMA


def smooth(counts, grid, k):
    """Add each cell's count to the grid points around it."""
    (west, south, east, north), cols, rows = grid
    out = [0.0] * (cols * rows)
    di = round(REACH / STEP)
    dj = round(REACH / (STEP * k))
    for key, n in counts.items():
        lat, lon = map(float, key.split(","))
        ci, cj = round((north - lat) / STEP), round((lon - west) / STEP)
        for i in range(max(ci - di, 0), min(ci + di + 1, rows)):
            dy = (ci - i) * STEP
            for j in range(max(cj - dj, 0), min(cj + dj + 1, cols)):
                dx = (cj - j) * STEP * k
                out[i * cols + j] += n * math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA))
    return out


def counts(q, fq, leave_out):
    total = ala.facet(q, fq, "point-0.1")
    for cell, person in leave_out:
        name = person.replace('"', '\\"')
        theirs = ala.facet(q, fq + [f'point-1:"{cell}"', f'collector:"{name}"'], "point-0.1")
        for key, n in theirs.items():
            total[key] -= n
    return total


def build_surface(extent, fq, leave_out=()):
    west, south, east, north = extent
    cols = round((east - west) / STEP) + 1
    rows = round((north - south) / STEP) + 1
    k = math.cos(math.radians((south + north) / 2))
    grid = (extent, cols, rows)

    bogong = smooth(counts(ala.BOGONG, fq, leave_out), grid, k)
    moths = smooth(counts(ala.MOTHS, fq, leave_out), grid, k)
    share = [round(100 * b / m) if m >= 1 else None for b, m in zip(bogong, moths)]
    weight = [round(m) for m in moths]
    return {"extent": extent, "step": STEP, "cols": cols, "rows": rows, "share": share, "weight": weight}
