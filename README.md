# world-airports

An open dataset of airports worldwide, including location, runways, frequencies, and more.

## Structure

```
world-airports/
├── data/airports/          # One JSON file per airport
├── scripts/
│   ├── validate.js         # Schema validator
│   ├── export/
│   │   ├── to-geojson.js   # Export as GeoJSON FeatureCollection
│   │   └── to-csv.js       # Export as CSV (airports + runways)
│   └── import/
│       └── from-ourairports.js  # Bootstrap from OurAirports data
└── docs/
    └── sources.md          # Approved data sources
```

## Filename Conventions

| Pattern | Meaning |
|---|---|
| `klax.json` | Lowercase ICAO code — the standard case |
| `_us_00001.json` | No ICAO assigned: `_<iso_country>_<ourairports_id>` |
| `klax_closed_1987.json` | Historical record after ICAO reassignment |

All filenames are lowercase. ICAO codes are always 4 letters so there is no structural ambiguity with `_` prefixed no-ICAO files.

## Data Format

Each file is a single JSON object. See [SCHEMA.md](SCHEMA.md) for the full field reference.

```json
{
  "icao": "KLAX",
  "iata": "LAX",
  "name": "Los Angeles International Airport",
  "type": "large_airport",
  "status": "open",
  "location": { ... },
  "scheduled_service": true,
  "runways": [ ... ],
  "frequencies": [ ... ],
  "metadata": { "created": "2024-01-01", "updated": "2024-11-15", "sources": ["ourairports"] }
}
```

## Validation

```bash
node scripts/validate.js
```

Exits with code 1 if any file fails validation.

## Exporting

```bash
# GeoJSON FeatureCollection
node scripts/export/to-geojson.js
# Outputs to exports/airports.geojson

# CSV (airports index + runways)
node scripts/export/to-csv.js
# Outputs to exports/airports.csv and exports/runways.csv
```

Exported files are listed in `.gitignore` — they are generated artifacts, not source data.

## Bootstrapping from OurAirports

[OurAirports](https://ourairports.com) provides CC0-licensed CSVs for ~80,000 airports worldwide. To import:

```bash
curl -O https://ourairports.com/data/airports.csv
curl -O https://ourairports.com/data/runways.csv
curl -O https://ourairports.com/data/airport-frequencies.csv

node scripts/import/from-ourairports.js \
  --airports airports.csv \
  --runways runways.csv \
  --frequencies airport-frequencies.csv
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Data: [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/)
Code: MIT
