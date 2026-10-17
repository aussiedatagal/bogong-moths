# One in five moths photographed around Sydney this September was a Bogong

Bogong moth sightings in spring 2026, compared with all moth sightings so that more people photographing insects doesn't skew the picture, by year around Sydney and by area across south-east Australia.

Live: https://aussiedatagal.github.io/bogong-moths/

## Data

- Occurrence records from the Atlas of Living Australia, mostly iNaturalist Australia, accessed 11 October 2026. Sightings are counted, not redistributed.
- Map outlines and town names from Natural Earth (public domain), ABS ASGS Edition 3 postal areas (CC BY 4.0) and the Murray-Darling Basin boundary from the Murray-Darling Basin Authority (CC BY 4.0).
- Night wind at 850 hPa from Open-Meteo archived forecasts (CC BY 4.0).

The files in `data/` are built from those sources. Map points are rounded to about 1 km.

## Updating

`.github/workflows/refresh.yml` runs every Monday in October and November 2026. It rebuilds the data from the ALA (`scripts/build.py`), writes the numbers into the page (`scripts/fill_text.py`) and publishes only if the written claims still match the data (`scripts/check_claims.py`). To run it by hand:

    python3 scripts/build.py && python3 scripts/fill_text.py && python3 scripts/check_claims.py

## Run locally

    python3 -m http.server 8000
