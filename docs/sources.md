# Data Sources

## Approved Sources

The following sources are approved for contributing data. All are open-licensed or public domain.

| Source | License | Coverage | URL |
|---|---|---|---|
| OurAirports | CC0 (Public Domain) | ~80,000 airports worldwide + runways + frequencies | https://ourairports.com/data/ |
| FAA | Public Domain (US gov) | US airports, procedures, NOTAMs | https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/ |
| EUROCONTROL | Open (check terms) | European ATC data | https://www.eurocontrol.int |
| OpenStreetMap | ODbL | Global aeroway features | https://www.openstreetmap.org |
| Wikidata | CC0 | Airport identifiers, links | https://www.wikidata.org |

## Bootstrap

The recommended starting point for bulk data is **OurAirports**. It is CC0-licensed, community-maintained, and covers airports, runways, frequencies, and navaids globally.

Download:
```
https://ourairports.com/data/airports.csv
https://ourairports.com/data/runways.csv
https://ourairports.com/data/airport-frequencies.csv
```

Then run:
```bash
node scripts/import/from-ourairports.js \
  --airports airports.csv \
  --runways runways.csv \
  --frequencies airport-frequencies.csv
```

## Prohibited Sources

Do not copy data from:
- **Jeppesen / Navdata** — proprietary, license-incompatible
- **AOPA** — proprietary member data
- **ForeFlight / Garmin** — proprietary
- **Wikipedia article text** — CC BY-SA, not compatible with ODbL without attribution chain

Wikipedia URLs as references (in the `wikipedia` field) are fine. Copying textual content from Wikipedia is not.
