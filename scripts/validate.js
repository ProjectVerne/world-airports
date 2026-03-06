#!/usr/bin/env node
/**
 * validate.js — validates all airport JSON files in data/airports/
 *
 * Checks:
 *   - Filename conventions (lowercase ICAO or _<country>_<id> prefix)
 *   - Required fields and types
 *   - Coordinate ranges
 *   - Enum values (type, status, surface, frequency types)
 *   - ISO date formats in metadata
 *   - ICAO field matches filename
 */

const fs = require("fs");
const path = require("path");

const AIRPORTS_DIR = path.join(__dirname, "..", "data", "airports");

const VALID_TYPES = [
  "large_airport",
  "medium_airport",
  "small_airport",
  "heliport",
  "seaplane_base",
  "balloonport",
  "closed",
];

const VALID_STATUSES = ["open", "closed", "construction", "abandoned"];

const VALID_SURFACES = [
  "asphalt",
  "concrete",
  "gravel",
  "grass",
  "dirt",
  "sand",
  "water",
  "snow",
  "ice",
  "pem",
  "turf",
  "unknown",
];

const VALID_FREQ_TYPES = [
  "ATIS",
  "APP",
  "DEP",
  "TWR",
  "GND",
  "CLNC DEL",
  "UNIC",
  "CTAF",
  "AWOS",
  "ASOS",
  "FSS",
  "OTHER",
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ICAO_RE = /^[a-z]{4}$/;
const NO_ICAO_RE = /^_[a-z]{2}_\d+(_closed_\d{4})?$/;
const CLOSED_SUFFIX_RE = /^[a-z]{4}_closed_\d{4}$/;

let errors = 0;
let warnings = 0;
let checked = 0;

function err(file, msg) {
  console.error(`  ERROR  [${file}] ${msg}`);
  errors++;
}

function warn(file, msg) {
  console.warn(`  WARN   [${file}] ${msg}`);
  warnings++;
}

function validateRunway(file, rwy, idx) {
  const prefix = `runway[${idx}]`;
  if (typeof rwy.id !== "string" || !rwy.id)
    err(file, `${prefix}.id must be a non-empty string`);
  if (typeof rwy.length_ft !== "number" || rwy.length_ft <= 0)
    err(file, `${prefix}.length_ft must be a positive number`);
  if (typeof rwy.width_ft !== "number" || rwy.width_ft <= 0)
    err(file, `${prefix}.width_ft must be a positive number`);
  if (!VALID_SURFACES.includes(rwy.surface))
    err(
      file,
      `${prefix}.surface "${rwy.surface}" is not a valid surface. Valid: ${VALID_SURFACES.join(", ")}`
    );
  if (typeof rwy.lighted !== "boolean")
    err(file, `${prefix}.lighted must be a boolean`);
  if (typeof rwy.closed !== "boolean")
    err(file, `${prefix}.closed must be a boolean`);

  for (const end of ["low", "high"]) {
    const e = rwy.ends?.[end];
    if (!e) {
      err(file, `${prefix}.ends.${end} is missing`);
      continue;
    }
    if (typeof e.ident !== "string") err(file, `${prefix}.ends.${end}.ident must be a string`);
    if (typeof e.latitude !== "number" || e.latitude < -90 || e.latitude > 90)
      err(file, `${prefix}.ends.${end}.latitude out of range [-90, 90]`);
    if (typeof e.longitude !== "number" || e.longitude < -180 || e.longitude > 180)
      err(file, `${prefix}.ends.${end}.longitude out of range [-180, 180]`);
    if (typeof e.elevation_ft !== "number")
      err(file, `${prefix}.ends.${end}.elevation_ft must be a number`);
    if (typeof e.heading_true !== "number" || e.heading_true < 0 || e.heading_true > 360)
      err(file, `${prefix}.ends.${end}.heading_true must be 0-360`);
    if (typeof e.displaced_threshold_ft !== "number" || e.displaced_threshold_ft < 0)
      err(file, `${prefix}.ends.${end}.displaced_threshold_ft must be >= 0`);
  }
}

function validateFrequency(file, freq, idx) {
  const prefix = `frequencies[${idx}]`;
  if (!VALID_FREQ_TYPES.includes(freq.type))
    err(
      file,
      `${prefix}.type "${freq.type}" is not valid. Valid: ${VALID_FREQ_TYPES.join(", ")}`
    );
  if (typeof freq.description !== "string")
    err(file, `${prefix}.description must be a string`);
  if (typeof freq.mhz !== "number" || freq.mhz < 100 || freq.mhz > 200)
    err(file, `${prefix}.mhz must be a number between 100-200`);
}

function validateAirport(filePath) {
  const filename = path.basename(filePath, ".json");
  let data;

  try {
    data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    err(filename, `Failed to parse JSON: ${e.message}`);
    return;
  }

  // Filename convention
  const isIcao = ICAO_RE.test(filename);
  const isNoIcao = NO_ICAO_RE.test(filename);
  const isClosed = CLOSED_SUFFIX_RE.test(filename);

  if (!isIcao && !isNoIcao && !isClosed) {
    err(
      filename,
      `Filename "${filename}" does not match a valid convention. ` +
        `Expected lowercase ICAO (e.g. klax), no-ICAO prefix (e.g. _us_00001), ` +
        `or closed suffix (e.g. klax_closed_1987)`
    );
  }

  // ICAO field matches filename
  if (isIcao && data.icao !== null) {
    if (typeof data.icao !== "string" || data.icao.toLowerCase() !== filename) {
      err(filename, `icao field "${data.icao}" does not match filename "${filename}"`);
    }
  }

  if (isNoIcao && data.icao !== null) {
    err(filename, `No-ICAO airports must have icao: null`);
  }

  // Required top-level fields
  const requiredStrings = ["name", "type", "status"];
  for (const f of requiredStrings) {
    if (typeof data[f] !== "string" || !data[f]) {
      err(filename, `"${f}" must be a non-empty string`);
    }
  }

  if (!VALID_TYPES.includes(data.type)) {
    err(filename, `type "${data.type}" is not valid. Valid: ${VALID_TYPES.join(", ")}`);
  }
  if (!VALID_STATUSES.includes(data.status)) {
    err(filename, `status "${data.status}" is not valid. Valid: ${VALID_STATUSES.join(", ")}`);
  }
  if (typeof data.scheduled_service !== "boolean") {
    err(filename, `scheduled_service must be a boolean`);
  }

  // Location
  const loc = data.location;
  if (!loc) {
    err(filename, `location is required`);
  } else {
    if (typeof loc.latitude !== "number" || loc.latitude < -90 || loc.latitude > 90)
      err(filename, `location.latitude out of range [-90, 90]`);
    if (typeof loc.longitude !== "number" || loc.longitude < -180 || loc.longitude > 180)
      err(filename, `location.longitude out of range [-180, 180]`);
    if (typeof loc.elevation_ft !== "number")
      err(filename, `location.elevation_ft must be a number`);
    if (typeof loc.iso_country !== "string" || loc.iso_country.length !== 2)
      err(filename, `location.iso_country must be a 2-letter ISO 3166-1 code`);
    if (typeof loc.iso_region !== "string")
      err(filename, `location.iso_region must be a string`);
    if (typeof loc.continent !== "string")
      err(filename, `location.continent must be a string`);
    if (loc.municipality !== null && typeof loc.municipality !== "string")
      err(filename, `location.municipality must be a string or null`);
  }

  // Runways
  if (!Array.isArray(data.runways)) {
    err(filename, `runways must be an array`);
  } else {
    data.runways.forEach((rwy, i) => validateRunway(filename, rwy, i));
    if (data.runways.length === 0 && data.type !== "heliport" && data.type !== "seaplane_base") {
      warn(filename, `no runways defined`);
    }
  }

  // Frequencies
  if (!Array.isArray(data.frequencies)) {
    err(filename, `frequencies must be an array`);
  } else {
    data.frequencies.forEach((freq, i) => validateFrequency(filename, freq, i));
  }

  // Metadata
  const meta = data.metadata;
  if (!meta) {
    err(filename, `metadata is required`);
  } else {
    if (!ISO_DATE_RE.test(meta.created))
      err(filename, `metadata.created must be an ISO date (YYYY-MM-DD)`);
    if (!ISO_DATE_RE.test(meta.updated))
      err(filename, `metadata.updated must be an ISO date (YYYY-MM-DD)`);
    if (!Array.isArray(meta.sources) || meta.sources.length === 0)
      err(filename, `metadata.sources must be a non-empty array`);
  }

  checked++;
}

// Main
const files = fs.readdirSync(AIRPORTS_DIR).filter((f) => f.endsWith(".json"));
console.log(`Validating ${files.length} airport file(s) in ${AIRPORTS_DIR}\n`);

for (const file of files) {
  validateAirport(path.join(AIRPORTS_DIR, file));
}

console.log(`\nChecked: ${checked}  Errors: ${errors}  Warnings: ${warnings}`);
if (errors > 0) {
  process.exit(1);
}
