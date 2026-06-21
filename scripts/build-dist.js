#!/usr/bin/env node
"use strict";
/**
 * build-dist.js — generate all consumption artifacts into dist/.
 *
 * Usage: node scripts/build-dist.js [dir]   (default dir: data/airports)
 *
 * Produces: dist/airports.csv, dist/airports.geojson, dist/airports.ndjson,
 * dist/codes.json. These are published as release assets; never hand-edited.
 */

const { execFileSync } = require("child_process");
const path = require("path");

const dir = process.argv[2] || "data/airports";
const exp = (s) => path.join(__dirname, "export", s);

const jobs = [
  [exp("to-csv.js"), [dir, "--out", "dist/airports.csv"]],
  [exp("to-geojson.js"), [dir, "--out", "dist/airports.geojson"]],
  [exp("to-ndjson.js"), [dir, "--out", "dist/airports.ndjson"]],
  [exp("to-codes.js"), [dir, "--out", "dist/codes.json"]],
];

for (const [script, args] of jobs) {
  execFileSync(process.execPath, [script, ...args], { stdio: "inherit" });
}
