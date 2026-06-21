"use strict";
/**
 * Shared helpers for the v2 airport dataset: CSV parsing, key minting,
 * code mapping, record construction, sharded paths, normalization, and a
 * recursive record walker.
 */

const fs = require("fs");
const path = require("path");

const ICAO_RE = /^[A-Z]{4}$/;

/**
 * Minimal RFC-4180 CSV parser. Handles quoted fields, embedded commas,
 * embedded newlines, and escaped quotes (""). Returns an array of arrays.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  // trailing field/row (no final newline)
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** Parse CSV text into an array of objects keyed by the header row. */
function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0];
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0] === "") continue; // blank line
    const obj = {};
    for (let c = 0; c < header.length; c++) obj[header[c]] = cells[c] ?? "";
    out.push(obj);
  }
  return out;
}

const up = (s) => (s && String(s).trim() ? String(s).trim().toUpperCase() : null);
const orNull = (s) => (s && String(s).trim() ? String(s).trim() : null);
const round6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * Mint the immutable key for a record.
 * Preference: lowercase ICAO if free; else _<iso_country>_<padded source id>.
 * `usedKeys` is a Set that this function reads and updates.
 */
function mintKey({ icao, iso_country, source_id }, usedKeys) {
  const icaoUp = up(icao);
  if (icaoUp && ICAO_RE.test(icaoUp)) {
    const k = icaoUp.toLowerCase();
    if (!usedKeys.has(k)) { usedKeys.add(k); return k; }
  }
  const cc = (iso_country || "zz").toLowerCase().replace(/[^a-z]/g, "").slice(0, 2) || "zz";
  let k = `_${cc}_${String(source_id).padStart(5, "0")}`;
  while (usedKeys.has(k)) k += "x"; // defensive; source ids are unique
  usedKeys.add(k);
  return k;
}

/** Map an OurAirports CSV row object to a v2 record (continent intentionally omitted). */
function recordFromOurAirports(row, { date, usedKeys }) {
  const source_id = Number(row.id);
  const key = mintKey(
    { icao: row.icao_code, iso_country: row.iso_country, source_id },
    usedKeys
  );
  const type = row.type || "small_airport";
  const lat = round6(parseFloat(row.latitude_deg));
  const lon = round6(parseFloat(row.longitude_deg));
  const elev = Number.parseInt(row.elevation_ft, 10);
  const codes = {
    icao: up(row.icao_code),
    iata: up(row.iata_code),
    gps: up(row.gps_code),
    local: orNull(row.local_code),
  };

  // Preserve OurAirports' primary `ident` (and its CSV keywords) as searchable
  // aliases. `ident` frequently holds a HISTORICAL/recoded ICAO (e.g. HEBA when
  // icao_code is now HEAX); keeping it lets old stored codes still resolve.
  const keywords = new Set(
    row.keywords ? row.keywords.split(",").map((s) => s.trim()).filter(Boolean) : []
  );
  const present = new Set(Object.values(codes).filter(Boolean));
  const ident = up(row.ident);
  if (ident && !present.has(ident)) keywords.add(ident);

  const record = {
    key,
    codes,
    name: (row.name && row.name.trim()) || "Unnamed",
    type,
    status: type === "closed" ? "closed" : "open",
    location: {
      latitude: Number.isFinite(lat) ? lat : 0,
      longitude: Number.isFinite(lon) ? lon : 0,
      elevation_ft: Number.isFinite(elev) ? elev : 0,
      iso_country: up(row.iso_country) || "ZZ",
      iso_region: orNull(row.iso_region) || `${up(row.iso_country) || "ZZ"}-U-A`,
      municipality: orNull(row.municipality),
    },
    keywords: [...keywords],
    wikipedia: orNull(row.wikipedia_link),
    metadata: {
      created: date,
      updated: date,
      sources: ["ourairports"],
      curated: false,
      source_id,
    },
  };
  return record;
}

/**
 * Directory shard segments derived ONLY from the immutable key.
 *  - ICAO-style keys (klax) -> ["k", "l"]
 *  - no-ICAO keys (_us_00001) -> ["_", "us", "00"]   (country + first 2 id digits)
 */
function shardSegments(key) {
  if (key.startsWith("_")) {
    const m = key.match(/^_([a-z]{2})_(\d+)/);
    const cc = m ? m[1] : "zz";
    const digits = (m ? m[2] : "00").padStart(2, "0").slice(0, 2);
    return ["_", cc, digits];
  }
  return [key[0], key[1]];
}

/** Relative path (POSIX) of a record's file under the airports root. */
function relPathFor(key) {
  return [...shardSegments(key), `${key}.json`].join("/");
}

/** Stable field ordering + rounded coords. Drops null optional fields for compactness. */
function normalize(rec) {
  const out = {
    key: rec.key,
    codes: {
      icao: rec.codes.icao ?? null,
      iata: rec.codes.iata ?? null,
      gps: rec.codes.gps ?? null,
      local: rec.codes.local ?? null,
    },
    name: rec.name,
    type: rec.type,
    status: rec.status,
    location: {
      latitude: round6(rec.location.latitude),
      longitude: round6(rec.location.longitude),
      elevation_ft: rec.location.elevation_ft,
      iso_country: rec.location.iso_country,
      iso_region: rec.location.iso_region,
      municipality: rec.location.municipality ?? null,
    },
    keywords: rec.keywords ?? [],
  };
  if (rec.wikipedia != null) out.wikipedia = rec.wikipedia;
  const meta = {
    created: rec.metadata.created,
    updated: rec.metadata.updated,
    sources: rec.metadata.sources,
    curated: rec.metadata.curated === true,
  };
  if (rec.metadata.source_id != null) meta.source_id = rec.metadata.source_id;
  if (rec.metadata.supersedes != null) meta.supersedes = rec.metadata.supersedes;
  if (rec.metadata.superseded_by != null) meta.superseded_by = rec.metadata.superseded_by;
  out.metadata = meta;
  return out;
}

/** Serialize a record deterministically (2-space indent, trailing newline). */
function serialize(rec) {
  return JSON.stringify(normalize(rec), null, 2) + "\n";
}

/** Recursively collect all .json record file paths under dir. */
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

/** Read and parse every record under dir, sorted by key for stable output. */
function readAll(dir) {
  return walk(dir)
    .map((f) => JSON.parse(fs.readFileSync(f, "utf8")))
    .sort((a, b) => a.key.localeCompare(b.key));
}

let _continents = null;
/** Continent (NA/EU/AS/…) derived from ISO country code. "" if unknown. */
function deriveContinent(iso_country) {
  if (!_continents) {
    _continents = JSON.parse(fs.readFileSync(path.join(__dirname, "continents.json"), "utf8"));
  }
  return _continents[(iso_country || "").toUpperCase()] || "";
}

module.exports = {
  ICAO_RE,
  parseCsv,
  parseCsvObjects,
  mintKey,
  recordFromOurAirports,
  shardSegments,
  relPathFor,
  normalize,
  serialize,
  walk,
  readAll,
  deriveContinent,
};
