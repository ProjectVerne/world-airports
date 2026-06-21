# Schema Reference (v2)

Each record is a single JSON object describing one physical airport, stored under
`data/airports/`.

> **v2 changed the identity model.** Identity is now a stable opaque `key`, and
> every human-typed code (ICAO, IATA, GPS, local) is a **non-unique attribute**
> under `codes`. See [ARCHITECTURE.md](ARCHITECTURE.md) for the rationale; this
> file is the field reference.

---

## 1. Identity: `key`

| Field | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | **Stable, immutable, globally unique identity.** Equals the filename stem. Assigned once and **never changed or reused**, even if the airport's ICAO/IATA later changes or is reassigned. This is the value downstream systems (including Verne routes) store. |

**Key minting rules** (in order of preference):

1. If the airport has an ICAO code that is **not already used as a key**, the key
   is the lowercase ICAO — e.g. `klax`. This keeps the common case readable.
2. Otherwise (no ICAO, or the ICAO key is already taken — see *reassignment*),
   mint `_<iso_country>_<source_id>`, e.g. `_us_00001`.

A `key` is **opaque**: never parse meaning out of it beyond "it identifies one
record." The ICAO-shaped form is a convenience, not a contract.

---

## 2. Codes (all nullable, all non-unique)

| Field | Type | Required | Description |
|---|---|---|---|
| `codes.icao` | string \| null | Yes | 4-letter ICAO code (uppercase). `null` if none. |
| `codes.iata` | string \| null | Yes | 3-letter IATA code (uppercase). `null` if none. |
| `codes.gps` | string \| null | Yes | GPS code (often equals ICAO; may differ). `null` if none. |
| `codes.local` | string \| null | Yes | National/local identifier, e.g. FAA `48Y`, `S43`. `null` if none. |

**No code is guaranteed unique.** The same token may appear as the `iata` of one
airport and the `local` of another, or two airports may legitimately share a
historic ICAO across a reassignment. Lookups by any code are therefore
**one-to-many** — see the collision index in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 3. Descriptive fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Official name. |
| `type` | string | Yes | See [Airport Types](#airport-types). |
| `status` | string | Yes | See [Statuses](#statuses). |
| `location` | object | Yes | See [Location](#location). |
| `keywords` | string[] | Yes | Alternative names / search aliases (may be empty). |
| `wikipedia` | string \| null | No | Wikipedia article URL. |
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

## Statuses

| Value | Description |
|---|---|
| `open` | Currently operational |
| `closed` | Permanently closed |
| `construction` | Under construction or major renovation |
| `abandoned` | No longer in use, infrastructure may remain |

> **Never delete a record to "remove" an airport.** Set `status` to `closed` or
> `abandoned`. Deletions are blocked in CI. See the no-delete invariant in
> [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Location

| Field | Type | Required | Description |
|---|---|---|---|
| `latitude` | number | Yes | WGS84 decimal degrees, range [-90, 90] |
| `longitude` | number | Yes | WGS84 decimal degrees, range [-180, 180] |
| `elevation_ft` | number | Yes | Elevation above MSL in feet |
| `iso_country` | string | Yes | ISO 3166-1 alpha-2 country code |
| `iso_region` | string | Yes | ISO 3166-2 region code |
| `municipality` | string \| null | Yes | Nearest city or town |

> `continent` is **not a contributor input** — it is auto-derived from
> `iso_country` by tooling and emitted in the generated `dist/*` artifacts
> (2-letter code: NA, SA, EU, AF, AS, OC, AN).

---

## Metadata

| Field | Type | Required | Description |
|---|---|---|---|
| `created` | string | Yes | ISO 8601 date of initial record creation (YYYY-MM-DD) |
| `updated` | string | Yes | ISO 8601 date of last update |
| `sources` | string[] | Yes | Data sources used, e.g. `["ourairports", "faa"]` (non-empty) |
| `curated` | boolean | Yes | If `true`, automated syncs must **not** overwrite this record's fields. Set when a human has hand-corrected the data. |
| `source_id` | number | No | Upstream numeric ID (e.g. OurAirports ID) used to mint `_<country>_<id>` keys. |
| `supersedes` | string \| null | No | `key` of the record this one replaced (e.g. after an ICAO reassignment). |
| `superseded_by` | string \| null | No | `key` of the record that replaced this one. Set on the closed/old record. |

---

## Filenames & Layout

Files are **sharded by the immutable `key`**, never by any mutable attribute such
as country. The shard path is a pure function of the key's leading characters, so
a record's location **never changes** when borders, sovereignty, or politics do —
and no single directory grows past GitHub's 1,000-entry web-UI truncation limit:

```
data/airports/k/l/klax.json          # key "klax"
data/airports/e/d/eddf.json          # key "eddf"
data/airports/_/us/00/_us_00001.json # key "_us_00001"
```

Bucketing rule:

- ICAO-style keys shard on the first two characters: `<key[0]>/<key[1]>/`.
- `_`-prefixed keys shard on the country segment plus a numeric bucket
  (`_/<cc>/<NN>/`) so the large no-ICAO sets stay balanced.

Rules:

- **Filename stem == `key`**, always. CI enforces this.
- All filenames are **lowercase**.
- The shard path is derived **only from `key`** and is regenerated by tooling —
  contributors should not hand-place files. Geography-based browsing (e.g. "all
  airports in DE") is served by the generated indexes in `dist/`, not the tree.

---

## Minimal valid airport

```json
{
  "key": "ksgr",
  "codes": { "icao": "KSGR", "iata": "SGR", "gps": "KSGR", "local": "SGR" },
  "name": "Sugar Land Regional Airport",
  "type": "small_airport",
  "status": "open",
  "location": {
    "latitude": 29.622334,
    "longitude": -95.656555,
    "elevation_ft": 82,
    "iso_country": "US",
    "iso_region": "US-TX",
    "municipality": "Houston"
  },
  "keywords": [],
  "wikipedia": null,
  "metadata": {
    "created": "2024-01-01",
    "updated": "2024-01-01",
    "sources": ["ourairports"],
    "curated": false
  }
}
```
