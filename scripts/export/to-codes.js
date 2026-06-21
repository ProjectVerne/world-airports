#!/usr/bin/env node
"use strict";
/**
 * to-codes.js — build the collision / resolution index from airport records.
 *
 * Usage:
 *   node scripts/export/to-codes.js [dir] [--out <file>]
 *     dir       records root (default: data/airports)
 *     --out     output path (default: dist/codes.json)
 *
 * Emits { "<CODE>": [ { key, name, iso_country, type, status }, ... ] } over
 * every non-null icao/iata/gps/local code. A code with >1 entry is a collision
 * the consumer must disambiguate. See ARCHITECTURE.md §2.
 */

const fs = require("fs");
const path = require("path");

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && e.name.endsWith(".json")) out.push(p);
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  let dir = "data/airports";
  let out = "dist/codes.json";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out = argv[++i];
    else dir = argv[i];
  }

  const index = {};
  let records = 0;
  for (const f of walk(dir)) {
    const rec = JSON.parse(fs.readFileSync(f, "utf8"));
    records++;
    const entry = {
      key: rec.key,
      name: rec.name,
      iso_country: rec.location.iso_country,
      type: rec.type,
      status: rec.status,
    };
    // Index the four codes plus any code-shaped keyword aliases (e.g. historical
    // ICAOs preserved from OurAirports' `ident`). City-name keywords are skipped.
    const tokens = new Set(Object.values(rec.codes || {}).filter(Boolean));
    for (const kw of rec.keywords || []) {
      if (/^[A-Z0-9]{3,4}$/.test(kw)) tokens.add(kw);
    }
    // de-dupe within a record: icao and gps are frequently identical, and that
    // is NOT a collision — a collision is the same code across distinct keys.
    for (const code of tokens) {
      (index[code] ||= []).push(entry);
    }
  }

  // sort entries within each code by key for stable output
  for (const code of Object.keys(index)) index[code].sort((a, b) => a.key.localeCompare(b.key));
  const sorted = {};
  for (const code of Object.keys(index).sort()) sorted[code] = index[code];

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(sorted, null, 2) + "\n");

  const collisions = Object.values(sorted).filter((l) => l.length > 1).length;
  console.log(`indexed ${records} record(s), ${Object.keys(sorted).length} code(s), ${collisions} collision(s) -> ${out}`);
}

main();
