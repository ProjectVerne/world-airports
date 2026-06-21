#!/usr/bin/env node
"use strict";
/**
 * validate.js — schema-driven validation for the v2 airport dataset.
 *
 * Usage:
 *   node scripts/validate.js [dir]        Validate every .json under <dir>
 *                                         (default: data/airports)
 *   node scripts/validate.js --changed    Validate only files changed vs. the
 *                                         merge-base with origin/main (fast CI path)
 *
 * Beyond JSON Schema it enforces the structural invariants that the schema
 * cannot express: key == filename stem, and file location == key-derived shard
 * path. It also reports (does not fail on) code collisions, which are expected.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const lib = require("./lib/airport");

const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "schema", "airport.schema.json"), "utf8")
);

let errors = 0;
let checked = 0;
const seenKeys = new Map();          // key -> file
const codeIndex = new Map();         // CODE -> [keys]

function err(file, msg) { console.error(`  ERROR  [${file}] ${msg}`); errors++; }

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile() && entry.name.endsWith(".json")) out.push(p);
  }
  return out;
}

function changedFiles() {
  let base = "origin/main";
  try { execSync(`git rev-parse --verify ${base}`, { stdio: "ignore" }); }
  catch { base = "HEAD~1"; }
  const out = execSync(`git diff --name-only --diff-filter=ACMR ${base}...HEAD`, { encoding: "utf8" });
  return out.split("\n").map((s) => s.trim()).filter((f) => f.endsWith(".json") && f.startsWith("data/"));
}

function validateFile(validate, file, airportsRoot) {
  const stem = path.basename(file, ".json");
  let data;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { err(stem, `invalid JSON: ${e.message}`); return; }

  if (!validate(data)) {
    for (const e of validate.errors) err(stem, `${e.instancePath || "/"} ${e.message}`);
  }

  // key == filename stem
  if (data.key !== stem) err(stem, `key "${data.key}" != filename stem "${stem}"`);

  // file lives at its key-derived shard path
  if (data.key) {
    const expected = lib.relPathFor(data.key);
    const actual = path.relative(airportsRoot, file).split(path.sep).join("/");
    if (expected !== actual) err(stem, `wrong location: expected ${expected}, found ${actual}`);
  }

  // duplicate key across files
  if (data.key) {
    if (seenKeys.has(data.key)) err(stem, `duplicate key, also in ${seenKeys.get(data.key)}`);
    else seenKeys.set(data.key, file);
  }

  // collect codes for the (non-failing) collision report
  if (data.codes) {
    for (const v of Object.values(data.codes)) {
      if (!v) continue;
      const list = codeIndex.get(v) || [];
      list.push(data.key);
      codeIndex.set(v, list);
    }
  }
  checked++;
}

function main() {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(SCHEMA);

  const arg = process.argv[2];
  const airportsRoot = "data/airports";
  let files, scope;

  if (arg === "--changed") {
    files = changedFiles();
    scope = "changed files";
  } else {
    const dir = arg || airportsRoot;
    files = walk(dir);
    scope = dir;
  }

  console.log(`Validating ${files.length} file(s) [${scope}]\n`);
  for (const f of files) {
    // shard check is relative to the airports root inside whatever dir we scan
    const root = f.includes(`${path.sep}data${path.sep}airports${path.sep}`)
      ? f.slice(0, f.indexOf(`${path.sep}data${path.sep}airports${path.sep}`) + `${path.sep}data${path.sep}airports`.length)
      : (arg && arg !== "--changed" ? arg : airportsRoot);
    validateFile(validate, f, root);
  }

  const collisions = [...codeIndex.entries()].filter(([, keys]) => new Set(keys).size > 1);
  console.log(`\nChecked: ${checked}  Errors: ${errors}  Code collisions (informational): ${collisions.length}`);
  if (collisions.length) {
    for (const [code, keys] of collisions.slice(0, 10)) {
      console.log(`  ~ ${code} -> ${[...new Set(keys)].join(", ")}`);
    }
    if (collisions.length > 10) console.log(`  … and ${collisions.length - 10} more`);
  }
  process.exit(errors > 0 ? 1 : 0);
}

main();
