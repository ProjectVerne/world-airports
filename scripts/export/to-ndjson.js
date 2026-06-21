#!/usr/bin/env node
"use strict";
/**
 * to-ndjson.js — full dataset as newline-delimited JSON (one record per line),
 * normalized and key-sorted. Streaming-friendly full dump.
 *
 * Usage:
 *   node scripts/export/to-ndjson.js [dir] [--out <file>]
 *     dir    records root (default: data/airports)
 *     --out  output path (default: dist/airports.ndjson)
 */

const fs = require("fs");
const path = require("path");
const lib = require("../lib/airport");

function main() {
  const argv = process.argv.slice(2);
  let dir = "data/airports";
  let out = "dist/airports.ndjson";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out = argv[++i];
    else dir = argv[i];
  }
  const records = lib.readAll(dir);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const lines = records.map((r) => JSON.stringify(lib.normalize(r)));
  fs.writeFileSync(out, lines.join("\n") + "\n");
  console.log(`wrote ${records.length} line(s) -> ${out}`);
}

main();
