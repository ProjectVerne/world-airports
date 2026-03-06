# Contributing

Thank you for helping improve this dataset.

## Ground Rules

- All data must come from [approved sources](docs/sources.md).
- Do not copy data from sources with incompatible licenses (e.g. Wikipedia text, proprietary aviation databases).
- One airport per file. No bulk structural changes without opening an issue first.

## Making a Change

1. Fork the repository and create a branch.
2. Edit or add the relevant JSON file(s) in `data/airports/`.
3. Run the validator: `node scripts/validate.js`
4. Fix any errors before opening a pull request.
5. In your PR description, cite the source for any data you added or changed.

## Adding a New Airport

- Use the ICAO code as the filename (lowercase), e.g. `ksgr.json`.
- If the airport has no ICAO code, use `_<iso_country>_<ourairports_id>.json`, e.g. `_us_12345.json`.
- Follow the schema in [SCHEMA.md](SCHEMA.md) exactly.
- Include at least: `icao`, `name`, `type`, `status`, `location`, `runways`, `frequencies`, `metadata`.

## Updating an Existing Airport

- Keep the existing filename unless the ICAO code itself has changed.
- Update `metadata.updated` to today's date.
- Add your source to `metadata.sources` if it isn't already listed.

## ICAO Reassignment (Rare)

If an ICAO code has been reassigned to a new airport:
1. Rename the old file to `<icao>_closed_<year>.json` and set `status: "closed"`.
2. Add a `metadata.formerly` field in the new file pointing back.
3. Ensure the new active airport owns the canonical `<icao>.json` filename.

## Validation

```bash
node scripts/validate.js
```

CI runs this automatically on every pull request. PRs with validation errors will not be merged.

## Data Format

See [SCHEMA.md](SCHEMA.md) for the full field reference and allowed enum values.
