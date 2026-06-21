#!/usr/bin/env node
"use strict";
/**
 * from-ourairports.js — build v2 airport records from the OurAirports CSV (CC0).
 *
 * OurAirports publishes CC0-licensed data at https://ourairports.com/data/airports.csv
 *
 * Usage:
 *   node scripts/import/from-ourairports.js --airports <csv> [options]
 *
 * Options:
 *   --airports <path>   OurAirports airports.csv (required)
 *   --out <dir>         Output root (default: data/airports)
 *   --country <XX>      Only emit these ISO countries (comma-separated)
 *   --date <YYYY-MM-DD> created/updated stamp (default: today, UTC)
 *   --check             Don't write; report what would change vs. existing files
 *
 * Key minting prefers lowercase ICAO; falls back to _<country>_<id>. The shard
 * path is derived from the key alone. continent is NOT written (auto-derived).
 */

const fs = require("fs");
const path = require("path");
const lib = require("../lib/airport");

function parseArgs(argv) {
  const a = { out: "data/airports", country: null, date: null, check: false, airports: null };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--airports") a.airports = argv[++i];
    else if (k === "--out") a.out = argv[++i];
    else if (k === "--country") a.country = (argv[++i] || "").toUpperCase().split(",").filter(Boolean);
    else if (k === "--date") a.date = argv[++i];
    else if (k === "--check") a.check = true;
    else throw new Error(`Unknown arg: ${k}`);
  }
  if (!a.airports) throw new Error("--airports <csv> is required");
  if (!a.date) a.date = new Date().toISOString().slice(0, 10);
  return a;
}

function main() {
  const args = parseArgs(process.argv);
  const text = fs.readFileSync(args.airports, "utf8");
  const rows = lib.parseCsvObjects(text);

  const wanted = args.country ? new Set(args.country) : null;
  // Stable order so key minting (ICAO-first-wins) is deterministic across runs.
  rows.sort((x, y) => Number(x.id) - Number(y.id));

  const usedKeys = new Set();
  let written = 0, skipped = 0, changed = 0, unchanged = 0;

  for (const row of rows) {
    const country = (row.iso_country || "").toUpperCase();
    // Mint keys against the GLOBAL set even when filtering, so a sample country's
    // keys match exactly what a full run would produce.
    const rec = lib.recordFromOurAirports(row, { date: args.date, usedKeys });

    if (wanted && !wanted.has(country)) { skipped++; continue; }

    const rel = lib.relPathFor(rec.key);
    const dest = path.join(args.out, rel);
    const serialized = lib.serialize(rec);

    if (args.check) {
      const prev = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : null;
      if (prev === null || prev !== serialized) changed++;
      else unchanged++;
      continue;
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, serialized);
    written++;
  }

  if (args.check) {
    console.log(`check: ${changed} would change/add, ${unchanged} unchanged` +
      (wanted ? `, ${skipped} outside filter` : ""));
  } else {
    console.log(`wrote ${written} record(s) to ${args.out}` +
      (wanted ? ` (filtered to ${[...wanted].join(",")}, skipped ${skipped})` : ""));
  }
}

main();
