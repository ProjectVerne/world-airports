# Schema Reference

Each airport file is a single JSON object with the following structure.

---

## Top-Level Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `icao` | string \| null | Yes | 4-letter ICAO code (uppercase internally, lowercase in filename). `null` for airports without a code. |
| `iata` | string \| null | Yes | 3-letter IATA code. `null` if not assigned. |
| `name` | string | Yes | Official airport name. |
| `type` | string | Yes | See [Airport Types](#airport-types). |
| `status` | string | Yes | See [Airport Statuses](#airport-statuses). |
| `location` | object | Yes | See [Location](#location). |
| `scheduled_service` | boolean | Yes | Whether the airport has scheduled commercial service. |
| `wikipedia` | string \| null | No | Wikipedia article URL. |
| `keywords` | string[] | Yes | Alternative names and search aliases. |
| `runways` | object[] | Yes | See [Runways](#runways). |
| `frequencies` | object[] | Yes | See [Frequencies](#frequencies). |
| `metadata` | object | Yes | See [Metadata](#metadata). |

---

## Airport Types

| Value | Description |
|---|---|
| `large_airport` | Major commercial airport (typically >10,000 pax/year) |
| `medium_airport` | Regional commercial airport |
| `small_airport` | General aviation, private, or minor airfield |
| `heliport` | Helicopter-only facility |
| `seaplane_base` | Water-based operations |
| `balloonport` | Balloon launch facility |
| `closed` | Permanently closed (legacy record) |

---

## Airport Statuses

| Value | Description |
|---|---|
| `open` | Currently operational |
| `closed` | Permanently closed |
| `construction` | Under construction or major renovation |
| `abandoned` | No longer in use, infrastructure may remain |

---

## Location

| Field | Type | Required | Description |
|---|---|---|---|
| `latitude` | number | Yes | WGS84 decimal degrees, range [-90, 90] |
| `longitude` | number | Yes | WGS84 decimal degrees, range [-180, 180] |
| `elevation_ft` | number | Yes | Elevation above MSL in feet |
| `continent` | string | Yes | 2-letter continent code (NA, SA, EU, AF, AS, OC, AN) |
| `iso_country` | string | Yes | ISO 3166-1 alpha-2 country code |
| `iso_region` | string | Yes | ISO 3166-2 region code |
| `municipality` | string \| null | Yes | Nearest city or town |

---

## Runways

Each runway is an object representing a single runway (both directions).

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Runway identifier, e.g. `06L/24R` |
| `length_ft` | number | Yes | Total runway length in feet |
| `width_ft` | number | Yes | Width in feet |
| `surface` | string | Yes | See [Surface Types](#surface-types) |
| `lighted` | boolean | Yes | Whether runway has lighting |
| `closed` | boolean | Yes | Whether this runway is closed |
| `ends` | object | Yes | `low` and `high` runway end objects |

### Runway End Fields

Each of `ends.low` and `ends.high`:

| Field | Type | Description |
|---|---|---|
| `ident` | string | Runway designator, e.g. `06L` |
| `latitude` | number | WGS84 latitude of threshold |
| `longitude` | number | WGS84 longitude of threshold |
| `elevation_ft` | number | Threshold elevation in feet |
| `heading_true` | number | Magnetic heading (0–360) |
| `displaced_threshold_ft` | number | Displaced threshold distance in feet |

### Surface Types

`asphalt`, `concrete`, `gravel`, `grass`, `dirt`, `sand`, `water`, `snow`, `ice`, `pem`, `turf`, `unknown`

---

## Frequencies

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | Yes | See [Frequency Types](#frequency-types) |
| `description` | string | Yes | Human-readable label, e.g. `"Tower (south complex)"` |
| `mhz` | number | Yes | Frequency in MHz |

### Frequency Types

`ATIS`, `APP`, `DEP`, `TWR`, `GND`, `CLNC DEL`, `UNIC`, `CTAF`, `AWOS`, `ASOS`, `FSS`, `OTHER`

---

## Metadata

| Field | Type | Required | Description |
|---|---|---|---|
| `created` | string | Yes | ISO 8601 date of initial record creation (YYYY-MM-DD) |
| `updated` | string | Yes | ISO 8601 date of last update |
| `sources` | string[] | Yes | Data sources used, e.g. `["ourairports", "faa"]` |
| `ourairports_id` | number | No | OurAirports numeric ID (no-ICAO airports only) |
| `formerly` | string | No | Previous ICAO code, for reassigned identifiers |

---

## Filename Conventions

| Pattern | Example | When to use |
|---|---|---|
| `<icao>.json` | `klax.json` | Airport has a valid ICAO code |
| `_<country>_<id>.json` | `_us_00001.json` | No ICAO assigned; use OurAirports ID |
| `<icao>_closed_<year>.json` | `klax_closed_1987.json` | Historical record after ICAO reassignment |

Rules:
- All filenames are **lowercase**
- ICAO codes are always 4 alphabetic characters, so `_` prefixed names can never collide
- The active airport always owns the canonical `<icao>.json` filename
