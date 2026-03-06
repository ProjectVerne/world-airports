#!/usr/bin/env node
/**
 * to-geojson.js — exports all airport data as a GeoJSON FeatureCollection
 *
 * Usage:
 *   node scripts/export/to-geojson.js [output-path]
 *
 * Output defaults to exports/airports.geojson
 */

const fs = require("fs");
const path = require("path");

const AIRPORTS_DIR = path.join(__dirname, "..", "..", "data", "airports");
const DEFAULT_OUT = path.join(__dirname, "..", "..", "exports", "airports.geojson");
const outPath = process.argv[2] || DEFAULT_OUT;

const files = fs.readdirSync(AIRPORTS_DIR).filter((f) => f.endsWith(".json"));

const features = [];

for (const file of files) {
  let airport;
  try {
    airport = JSON.parse(fs.readFileSync(path.join(AIRPORTS_DIR, file), "utf8"));
  } catch (e) {
    console.error(`Skipping ${file}: ${e.message}`);
    continue;
  }

  const { location, icao, iata, name, type, status, scheduled_service } = airport;
  if (!location || typeof location.longitude !== "number" || typeof location.latitude !== "number") {
    console.warn(`Skipping ${file}: missing/invalid coordinates`);
    continue;
  }

  features.push({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [location.longitude, location.latitude],
    },
    properties: {
      icao,
      iata,
      name,
      type,
      status,
      scheduled_service,
      elevation_ft: location.elevation_ft,
      iso_country: location.iso_country,
      iso_region: location.iso_region,
      municipality: location.municipality,
      continent: location.continent,
      runway_count: airport.runways?.length ?? 0,
    },
  });
}

const geojson = {
  type: "FeatureCollection",
  features,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(geojson, null, 2));
console.log(`Exported ${features.length} airports to ${outPath}`);
