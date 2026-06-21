# Architecture

How this dataset is structured, why, and the contract it offers consumers (the
primary consumer being the Verne application database). For per-field details see
[SCHEMA.md](SCHEMA.md).

---

## 1. Identity is not a code

The central decision: **a record's identity is an opaque `key`, never a code a
human types.** ICAO, IATA, GPS, and local codes are all *attributes* that may be
absent, may change, and are **not guaranteed unique**.

This follows the OurAirports / `datasets/airport-codes` model (`ident` is the key;
`icao_code`/`iata_code`/`gps_code`/`local_code` are columns) rather than the
"ICAO is the primary key" model. We chose it because the alternative breaks on
real-world data:

- ~92% of airfields have **no ICAO code** at all (general-aviation strips).
- The same token collides across code *types* — one airport's IATA can equal
  another's local code.
- ICAO codes get **reassigned** between airports over time.
- Verne's own routes already reference local codes (`48Y`, `S43`, `UT25`) that
  are not ICAO at all.

So `key` is assigned once, is immutable, and is never reused. See
[SCHEMA.md §1](SCHEMA.md#1-identity-key) for minting rules.

---

## 2. Codes are non-unique → lookups are one-to-many

Because no code is unique, **resolving a typed token is inherently a
one-to-many operation.** A user typing `MMAX` may match two different physical
airports; a user typing `LON` matches a whole metro area.

We make this explicit with a **generated collision index**, `dist/codes.json`,
built in CI from all records:

```jsonc
{
  "MMAX": [
    { "key": "mmax",        "name": "Maxville Rgnl",  "iso_country": "US", "type": "small_airport", "status": "open"   },
    { "key": "_mx_07731",   "name": "Maxtown Helipad", "iso_country": "MX", "type": "heliport",       "status": "open"   }
  ],
  "LON": [ { "key": "lon", "kind": "metro", "members": ["egll","egkk","eglc","egss","eggw","eglc"] } ]
}
```

The index maps **every code, in every code-type, plus metro codes** to the list
of records that answer to it, each entry carrying just enough to disambiguate
(name, country, type, status). Consumers resolve a token like this:

1. Look up the token in `codes.json`.
2. **0 matches** → unknown code.
3. **exactly 1 match** → resolve silently to that `key`.
4. **>1 match (or a metro)** → return the candidates so the UI can ask
   *"which one did you mean?"* — never guess.

This is where Verne's disambiguation UX is rooted: the clarify prompt is a direct
rendering of a >1 result from this index.

---

## 3. The no-delete invariant

**Records are append/update-only. An airport is never removed by deleting its
file.** To retire one, set `status` to `closed` or `abandoned`. This is enforced
two ways:

- **CI guard** — a PR that *removes* any file under `data/` fails the build.
- **Reassignment, not deletion** — if ICAO `MMAX` moves from airport A to B:
  A keeps its `key` and gets `status: "closed"` + `superseded_by: "<B.key>"`;
  B is a new record with its own fresh `key` and `supersedes: "<A.key>"`. Both
  still carry `codes.icao: "MMAX"`, so the collision index lists both and
  resolution prefers the `open` one while still being able to clarify.

The reason is downstream safety (§5): a record that any saved route might point
at must never vanish.

---

## 4. Editable source vs. generated artifacts

The repo holds **one JSON file per record** as the editable source of truth —
chosen for clean PR diffs, line-level review, and room for nested `runways` /
`frequencies` / `codes`. Flat tabular forms (the shape every reference dataset
ships) are **generated**, never hand-edited:

| Artifact | Purpose |
|---|---|
| `dist/airports.csv` | Flat one-row-per-airport table (ip2location / lxndrblz shape). |
| `dist/airports.geojson` | FeatureCollection for map consumers. |
| `dist/codes.json` | The collision / resolution index (§2). |
| `dist/airports.ndjson` | Streaming-friendly full dump. |

These are produced by `scripts/export/*` and published as **release assets** on
each `vYYYY.MM` tag (and/or pushed to S3). Consumers pin a release/tag or a
content hash and pull **one** artifact — never the 32k+ individual files via API.

Directory sharding (`data/airports/<iso_country>/<first-char>/<key>.json`) keeps
any single folder browsable on GitHub (which truncates flat listings at 1,000
entries) and makes country-scoped review trivial.

---

## 5. Contract with the Verne database

Verne consumes this dataset; the sync is **one-way** (repo → DB) and obeys two
rules that together guarantee no saved route ever breaks:

1. **The DB keys airports by `key`, not by ICAO.** `FlightSegments` and
   `AirportRating` reference the stable `key`. (This replaces the legacy
   `icao`-as-primary-key schema.)

2. **Routes store the *resolved* `key`, never the typed token.** Disambiguation
   (§2) happens at *input* time; once a leg is saved it points at one immutable
   `key`. So if `MMAX` later becomes ambiguous, or a new colliding airport is
   added, or a code is reassigned — **existing routes are frozen and unaffected.**

The importer itself:

- **Upserts by `key`; never issues `DELETE`.** A record that flips to
  `closed`/`abandoned`, or disappears from the dataset, is marked deprecated in
  the DB — the row stays, especially if any route references it (reference-check
  guard).
- **Respects `metadata.curated: true`** — automated upstream syncs (e.g. the
  weekly FAA job) must not clobber human-corrected fields.
- Runs only after a **coverage assertion** passes: every `key` referenced by an
  existing route exists in the dataset. Until that is green, the repo is not
  treated as authoritative.

---

## 6. Data flow end to end

```
Contributor / FAA auto-sync PR
        │  (validate.js + no-delete guard + key==filename + collision sanity)
        ▼
   merge to main  ──▶  tag vYYYY.MM  ──▶  generate dist/* (csv, geojson, codes.json, ndjson)
                                                │  release assets / S3
                                                ▼
                              Verne importer (one-way, upsert-by-key, never delete)
                                                │
                                                ▼
                          Verne DB  ──▶  resolve typed code via codes.json
                                          0 → unknown · 1 → silent · >1 → clarify UX
                                          routes persist resolved `key`
```

---

## 7. Open decisions (to confirm before the migration PR)

- **Metro coverage** — do we seed metro records now (LON/NYC/…), or add the
  `kind: "metro"` machinery but defer populating it until Verne's search needs it?
- **DB richness** — does Verne store the full `runways`/`frequencies`/`codes`
  blocks, or only the fields its current table needs (name, country, region,
  lat/lon) plus `key` + `codes`?
- **Sharding key** — `iso_country/<first-char>` (proposed) vs. continent-based
  vs. flat-with-prefix. Affects the one-time migration commit.
- **Artifact transport** — GitHub Release assets vs. S3 bucket for `dist/*`, and
  whether the importer pins a tag or a content hash.
