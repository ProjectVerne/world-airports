# Changelog

All notable changes to this dataset will be documented here.

## [Unreleased]

### Added
- `scripts/import/from-faa-us.js` — incremental sync of all US airports from FAA data via OurAirports (CC0). Filters to `iso_country=US`, detects changes against existing files, and preserves manually-curated records. Supports `--check` mode for CI diff reporting.
- `.github/workflows/sync-us-airports.yml` — weekly GitHub Actions workflow (Mondays 06:00 UTC) that downloads the latest FAA/OurAirports data, runs the sync script, validates the result, and opens a pull request if any records changed. Also supports `workflow_dispatch` for on-demand runs.
- Initial repository scaffold with schema, validator, and sample airports (KLAX, no-ICAO sample)

## Format

Entries follow [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) conventions. Releases are tagged as `vYYYY.MM` (e.g. `v2024.01`).

### Types of changes
- **Added** — new airports or new fields
- **Changed** — updates to existing records
- **Removed** — airports removed or marked closed
- **Fixed** — corrected data errors
