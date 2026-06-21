#!/usr/bin/env node
"use strict";
/**
 * to-geojson.js — export all records as a GeoJSON FeatureCollection.
 *
 * Usage:
 *   node scripts/export/to-geojson.js [dir] [--out <file>]
 *     dir    records root (default: data/airports)
 *     --out  output path (default: dist/airports.geojson)
 */

const fs = require("fs");
const path = require("path");
const lib = require("../lib/airport");

function feature(rec) {
  const l = rec.location || {};
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [l.longitude, l.latitude] },
    properties: {
      key: rec.key,
      icao: rec.codes?.icao ?? null,
      iata: rec.codes?.iata ?? null,
      name: rec.name,
      type: rec.type,
      status: rec.status,
      iso_country: l.iso_country,
      municipality: l.municipality ?? null,
    },
  };
}

function main() {
  const argv = process.argv.slice(2);
  let dir = "data/airports";
  let out = "dist/airports.geojson";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out = argv[++i];
    else dir = argv[i];
  }
  const records = lib.readAll(dir);
  const fc = { type: "FeatureCollection", features: records.map(feature) };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(fc) + "\n");
  console.log(`wrote ${records.length} feature(s) -> ${out}`);
}

main();
