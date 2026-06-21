#!/usr/bin/env node
"use strict";
/**
 * to-csv.js — flat one-row-per-airport CSV (the shape most consumers want).
 *
 * Usage:
 *   node scripts/export/to-csv.js [dir] [--out <file>]
 *     dir    records root (default: data/airports)
 *     --out  output path (default: dist/airports.csv)
 */

const fs = require("fs");
const path = require("path");
const lib = require("../lib/airport");

const COLUMNS = [
  "key", "icao", "iata", "gps", "local", "name", "type", "status",
  "latitude", "longitude", "elevation_ft", "continent", "iso_country",
  "iso_region", "municipality", "wikipedia", "keywords", "curated", "sources",
];

function esc(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(rec) {
  const c = rec.codes || {};
  const l = rec.location || {};
  return [
    rec.key, c.icao, c.iata, c.gps, c.local, rec.name, rec.type, rec.status,
    l.latitude, l.longitude, l.elevation_ft, lib.deriveContinent(l.iso_country),
    l.iso_country, l.iso_region, l.municipality, rec.wikipedia ?? "",
    (rec.keywords || []).join("|"), rec.metadata?.curated === true,
    (rec.metadata?.sources || []).join("|"),
  ].map(esc).join(",");
}

function main() {
  const argv = process.argv.slice(2);
  let dir = "data/airports";
  let out = "dist/airports.csv";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out = argv[++i];
    else dir = argv[i];
  }
  const records = lib.readAll(dir);
  const lines = [COLUMNS.join(","), ...records.map(row)];
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lines.join("\n") + "\n");
  console.log(`wrote ${records.length} row(s) -> ${out}`);
}

main();
