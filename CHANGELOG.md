# Changelog

All notable changes to this dataset will be documented here.

## [Unreleased]

### Added
- **v2 identity model** — stable opaque `key`, non-unique `codes` (icao/iata/gps/local), key-derived sharding. See `SCHEMA.md` and `ARCHITECTURE.md`.
- `schema/airport.schema.json` + schema-driven `scripts/validate.js` (also enforces `key == filename` and shard path; reports code collisions).
- `scripts/import/from-ourairports.js` — global importer; upsert-only, preserves `created` and curated records, never deletes.
- `scripts/export/{to-csv,to-geojson,to-ndjson,to-codes}.js` + `scripts/build-dist.js` — generated consumption artifacts.
- `.github/workflows/release.yml` — on `v*` tags, validates, builds `dist/*`, and publishes them as release assets.
- `.github/workflows/sync-ourairports.yml` — weekly global OurAirports sync (PR on change). Replaces the US-only sync.
- `.github/workflows/no-delete.yml` — blocks record deletions (bypass with the `migration` label).

### Changed
- Regenerated the full worldwide dataset (85,615 records) in the v2 layout.

### Removed
- `scripts/import/from-faa-us.js` and `.github/workflows/sync-us-airports.yml` — superseded by the global OurAirports sync.

## Format

Entries follow [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) conventions. Releases are tagged as `vYYYY.MM` (e.g. `v2024.01`).

### Types of changes
- **Added** — new airports or new fields
- **Changed** — updates to existing records
- **Removed** — airports removed or marked closed
- **Fixed** — corrected data errors
