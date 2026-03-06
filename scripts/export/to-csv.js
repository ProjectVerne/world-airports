#!/usr/bin/env node
/**
 * to-csv.js — exports airport master index as CSV (airports) and runways CSV
 *
 * Usage:
 *   node scripts/export/to-csv.js [output-dir]
 *
 * Output defaults to exports/
 * Produces:
 *   airports.csv   — one row per airport
 *   runways.csv    — one row per runway end
 */

const fs = require("fs");
const path = require("path");

const AIRPORTS_DIR = path.join(__dirname, "..", "..", "data", "airports");
const outDir = process.argv[2] || path.join(__dirname, "..", "..", "exports");

fs.mkdirSync(outDir, { recursive: true });

function escapeCsv(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function row(...fields) {
  return fields.map(escapeCsv).join(",");
}

const airportRows = [
  row(
    "icao",
    "iata",
    "name",
    "type",
    "status",
    "latitude",
    "longitude",
    "elevation_ft",
    "continent",
    "iso_country",
    "iso_region",
    "municipality",
    "scheduled_service",
    "runway_count",
    "frequency_count",
    "wikipedia",
    "sources"
  ),
];

const runwayRows = [
  row(
    "airport_icao",
    "runway_id",
    "length_ft",
    "width_ft",
    "surface",
    "lighted",
    "closed",
    "le_ident",
    "le_latitude",
    "le_longitude",
    "le_elevation_ft",
    "le_heading_true",
    "le_displaced_threshold_ft",
    "he_ident",
    "he_latitude",
    "he_longitude",
    "he_elevation_ft",
    "he_heading_true",
    "he_displaced_threshold_ft"
  ),
];

const files = fs.readdirSync(AIRPORTS_DIR).filter((f) => f.endsWith(".json"));

for (const file of files) {
  let airport;
  try {
    airport = JSON.parse(fs.readFileSync(path.join(AIRPORTS_DIR, file), "utf8"));
  } catch (e) {
    console.error(`Skipping ${file}: ${e.message}`);
    continue;
  }

  const { icao, iata, name, type, status, location, scheduled_service, runways, frequencies, wikipedia, metadata } = airport;

  airportRows.push(
    row(
      icao,
      iata,
      name,
      type,
      status,
      location?.latitude,
      location?.longitude,
      location?.elevation_ft,
      location?.continent,
      location?.iso_country,
      location?.iso_region,
      location?.municipality,
      scheduled_service,
      runways?.length ?? 0,
      frequencies?.length ?? 0,
      wikipedia,
      metadata?.sources?.join("|")
    )
  );

  for (const rwy of runways ?? []) {
    const le = rwy.ends?.low;
    const he = rwy.ends?.high;
    runwayRows.push(
      row(
        icao,
        rwy.id,
        rwy.length_ft,
        rwy.width_ft,
        rwy.surface,
        rwy.lighted,
        rwy.closed,
        le?.ident,
        le?.latitude,
        le?.longitude,
        le?.elevation_ft,
        le?.heading_true,
        le?.displaced_threshold_ft,
        he?.ident,
        he?.latitude,
        he?.longitude,
        he?.elevation_ft,
        he?.heading_true,
        he?.displaced_threshold_ft
      )
    );
  }
}

const airportsCsvPath = path.join(outDir, "airports.csv");
const runwaysCsvPath = path.join(outDir, "runways.csv");

fs.writeFileSync(airportsCsvPath, airportRows.join("\n"));
fs.writeFileSync(runwaysCsvPath, runwayRows.join("\n"));

console.log(`Exported ${airportRows.length - 1} airports to ${airportsCsvPath}`);
console.log(`Exported ${runwayRows.length - 1} runway ends to ${runwaysCsvPath}`);
