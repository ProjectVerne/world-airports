#!/usr/bin/env node
/**
 * from-faa-us.js — syncs US airport data from FAA via OurAirports
 *
 * OurAirports (https://ourairports.com) publishes CC0-licensed CSVs sourced
 * directly from FAA NASR (National Airspace System Resources) for US airports.
 * This script filters to US-only records and performs incremental updates,
 * writing only new or changed files.
 *
 * Usage:
 *   node scripts/import/from-faa-us.js [options]
 *
 * Options:
 *   --airports <path>     airports.csv  (auto-downloaded if omitted)
 *   --runways <path>      runways.csv   (auto-downloaded if omitted)
 *   --frequencies <path>  airport-frequencies.csv (auto-downloaded if omitted)
 *   --out <dir>           Output directory (default: data/airports)
 *   --check               Report changes without writing (exits 1 if changes exist)
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const https = require("https");
const os = require("os");

const DEFAULT_OUT = path.join(__dirname, "..", "..", "data", "airports");

const OA_AIRPORTS_URL = "https://ourairports.com/data/airports.csv";
const OA_RUNWAYS_URL = "https://ourairports.com/data/runways.csv";
const OA_FREQS_URL = "https://ourairports.com/data/airport-frequencies.csv";

// --- Argument parsing ---
const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}
const checkOnly = args.includes("--check") || args.includes("--dry-run");
const airportsCsvPath = getArg("--airports");
const runwaysCsvPath = getArg("--runways");
const freqCsvPath = getArg("--frequencies");
const outDir = getArg("--out") || DEFAULT_OUT;

// --- Download helper (follows redirects) ---
function downloadFile(url, dest, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects === 0) {
      reject(new Error(`Too many redirects for ${url}`));
      return;
    }
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadFile(res.headers.location, dest, maxRedirects - 1)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", reject);
      })
      .on("error", reject);
  });
}

// --- CSV parser (handles quoted fields and escaped quotes) ---
function parseCsvLine(line) {
  const result = [];
  let inQuote = false;
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

async function parseCsv(filePath) {
  const rows = [];
  let headers = null;
  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
  for await (const line of rl) {
    const cols = parseCsvLine(line);
    if (!headers) {
      headers = cols;
    } else {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = cols[i] ?? ""));
      rows.push(obj);
    }
  }
  return rows;
}

// --- Field helpers ---
function num(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}
function bool(val) {
  return val === "1" || val === "yes" || val === "true";
}
function strOrNull(val) {
  return val && val.trim() ? val.trim() : null;
}

function surfaceFromOa(raw) {
  if (!raw) return "unknown";
  const s = raw.toLowerCase();
  if (s.includes("asph") || s.includes("bit") || s.includes("asp")) return "asphalt";
  if (s.includes("conc") || s.includes("pcc")) return "concrete";
  if (s.includes("gravel") || s.includes("grvl") || s.includes("grv")) return "gravel";
  if (s.includes("grass") || s.includes("turf") || s.includes("grs")) return "grass";
  if (s.includes("dirt") || s.includes("clay")) return "dirt";
  if (s.includes("sand") || s.includes("snd")) return "sand";
  if (s.includes("water") || s.includes("wat")) return "water";
  if (s.includes("snow") || s.includes("ice")) return "snow";
  if (s.includes("pem")) return "pem";
  return "unknown";
}

function freqTypeFromOa(raw) {
  const t = (raw || "").toUpperCase().trim();
  const VALID = ["ATIS", "APP", "DEP", "TWR", "GND", "CLNC DEL", "UNIC", "CTAF", "AWOS", "ASOS", "FSS"];
  if (VALID.includes(t)) return t;
  if (t.includes("APPR") || t.includes("APPROACH")) return "APP";
  if (t.includes("DEP")) return "DEP";
  if (t.includes("TWR") || t.includes("TOWER")) return "TWR";
  if (t.includes("GND") || t.includes("GROUND")) return "GND";
  if (t.includes("ATIS")) return "ATIS";
  if (t.includes("UNIC") || t.includes("CTAF")) return "UNIC";
  return "OTHER";
}

function icaoFilename(airport) {
  if (airport.gps_code && /^[A-Za-z]{4}$/.test(airport.gps_code.trim())) {
    return airport.gps_code.trim().toLowerCase();
  }
  const country = (strOrNull(airport.iso_country) || "xx").toLowerCase().slice(0, 2);
  const id = String(airport.id).padStart(5, "0");
  return `_${country}_${id}`;
}

// Returns true if the airport data has meaningfully changed (metadata dates excluded).
function hasDataChanged(existing, incoming) {
  const a = JSON.parse(JSON.stringify(existing));
  const b = JSON.parse(JSON.stringify(incoming));
  if (a.metadata) { delete a.metadata.updated; delete a.metadata.created; }
  if (b.metadata) { delete b.metadata.updated; delete b.metadata.created; }
  return JSON.stringify(a) !== JSON.stringify(b);
}

const today = new Date().toISOString().slice(0, 10);

// --- Main ---
(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "faa-us-"));

  try {
    // Resolve CSV paths — auto-download from OurAirports if not provided
    let resolvedAirports = airportsCsvPath;
    let resolvedRunways = runwaysCsvPath;
    let resolvedFreqs = freqCsvPath;

    if (!resolvedAirports) {
      process.stdout.write("Downloading airports.csv from OurAirports (FAA source)... ");
      resolvedAirports = path.join(tmpDir, "airports.csv");
      await downloadFile(OA_AIRPORTS_URL, resolvedAirports);
      console.log("done.");
    }
    if (!resolvedRunways) {
      process.stdout.write("Downloading runways.csv... ");
      resolvedRunways = path.join(tmpDir, "runways.csv");
      await downloadFile(OA_RUNWAYS_URL, resolvedRunways);
      console.log("done.");
    }
    if (!resolvedFreqs) {
      process.stdout.write("Downloading airport-frequencies.csv... ");
      resolvedFreqs = path.join(tmpDir, "frequencies.csv");
      await downloadFile(OA_FREQS_URL, resolvedFreqs);
      console.log("done.");
    }

    // Parse and filter to US airports
    process.stdout.write("Parsing airports... ");
    const allAirports = await parseCsv(resolvedAirports);
    const airports = allAirports.filter((a) => a.iso_country === "US");
    console.log(`${airports.length} US airports (${allAirports.length} total).`);

    // Index runways by ICAO ident
    process.stdout.write("Parsing runways... ");
    const allRunways = await parseCsv(resolvedRunways);
    const runwaysByIdent = {};
    for (const rwy of allRunways) {
      const k = rwy.airport_ident?.toUpperCase();
      if (!k) continue;
      if (!runwaysByIdent[k]) runwaysByIdent[k] = [];
      runwaysByIdent[k].push(rwy);
    }
    console.log(`${allRunways.length} runway records.`);

    // Index frequencies by ICAO ident
    process.stdout.write("Parsing frequencies... ");
    const allFreqs = await parseCsv(resolvedFreqs);
    const freqsByIdent = {};
    for (const freq of allFreqs) {
      const k = freq.airport_ident?.toUpperCase();
      if (!k) continue;
      if (!freqsByIdent[k]) freqsByIdent[k] = [];
      freqsByIdent[k].push(freq);
    }
    console.log(`${allFreqs.length} frequency records.\n`);

    if (!checkOnly) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    let added = 0;
    let updated = 0;
    let unchanged = 0;
    let skipped = 0;
    const seenFilenames = new Set();

    for (const apt of airports) {
      const filename = icaoFilename(apt);
      const filePath = path.join(outDir, `${filename}.json`);

      if (seenFilenames.has(filename)) {
        console.warn(`  COLLISION: ${filename} — skipping duplicate id=${apt.id}`);
        skipped++;
        continue;
      }
      seenFilenames.add(filename);

      const ident = apt.gps_code?.trim().toUpperCase() || null;
      const localCode = apt.local_code?.trim().toUpperCase() || null;
      const oaRunways = runwaysByIdent[ident] || runwaysByIdent[localCode] || [];
      const oaFreqs = freqsByIdent[ident] || freqsByIdent[localCode] || [];

      // Build runways — skip entries missing dimensions or end threshold coordinates
      const runwaysList = oaRunways
        .filter((rwy) => {
          const len = num(rwy.length_ft);
          const wid = num(rwy.width_ft);
          if (!len || len <= 0 || !wid || wid <= 0) return false;
          // Both threshold lat/lon required for runway end validation
          if (
            num(rwy.le_latitude_deg) === null || num(rwy.le_longitude_deg) === null ||
            num(rwy.he_latitude_deg) === null || num(rwy.he_longitude_deg) === null
          ) return false;
          return true;
        })
        .map((rwy) => ({
          id: `${rwy.le_ident || "?"}/${rwy.he_ident || "?"}`,
          length_ft: num(rwy.length_ft),
          width_ft: num(rwy.width_ft),
          surface: surfaceFromOa(rwy.surface),
          lighted: bool(rwy.lighted),
          closed: bool(rwy.closed),
          ends: {
            low: {
              ident: strOrNull(rwy.le_ident) || "?",
              latitude: num(rwy.le_latitude_deg),
              longitude: num(rwy.le_longitude_deg),
              elevation_ft: num(rwy.le_elevation_ft) ?? 0,
              heading_true: num(rwy.le_heading_degT) ?? 0,
              displaced_threshold_ft: num(rwy.le_displaced_threshold_ft) ?? 0,
            },
            high: {
              ident: strOrNull(rwy.he_ident) || "?",
              latitude: num(rwy.he_latitude_deg),
              longitude: num(rwy.he_longitude_deg),
              elevation_ft: num(rwy.he_elevation_ft) ?? 0,
              heading_true: num(rwy.he_heading_degT) ?? 0,
              displaced_threshold_ft: num(rwy.he_displaced_threshold_ft) ?? 0,
            },
          },
        }));

      // Build frequencies — skip entries with out-of-range MHz (validator rejects 100–200 band)
      const frequenciesList = oaFreqs
        .filter((freq) => {
          const mhz = num(freq.frequency_mhz);
          return mhz !== null && mhz >= 100 && mhz <= 200;
        })
        .map((freq) => ({
          type: freqTypeFromOa(freq.type),
          description: strOrNull(freq.description) || "",
          mhz: num(freq.frequency_mhz),
        }));

      const isNoIcao = filename.startsWith("_");

      // Load existing file if present
      let existing = null;
      if (fs.existsSync(filePath)) {
        try {
          existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch {
          // Treat unparseable file as new
        }
      }

      // Skip files that have been manually curated with non-automated sources
      if (existing) {
        const existingSources = existing.metadata?.sources || [];
        const isAutomated = existingSources.every((s) => ["ourairports", "faa"].includes(s));
        if (!isAutomated) {
          unchanged++;
          continue;
        }
      }

      const incomingData = {
        icao: isNoIcao ? null : ident,
        iata: strOrNull(apt.iata_code),
        name: apt.name?.trim() || "Unknown",
        type: apt.type?.trim() || "small_airport",
        status: bool(apt.closed) ? "closed" : "open",
        location: {
          latitude: num(apt.latitude_deg),
          longitude: num(apt.longitude_deg),
          elevation_ft: num(apt.elevation_ft) ?? 0,
          continent: strOrNull(apt.continent),
          iso_country: strOrNull(apt.iso_country),
          iso_region: strOrNull(apt.iso_region),
          municipality: strOrNull(apt.municipality),
        },
        scheduled_service: bool(apt.scheduled_service),
        wikipedia: strOrNull(apt.wikipedia_link),
        keywords: apt.keywords
          ? apt.keywords.split(",").map((k) => k.trim()).filter(Boolean)
          : [],
        runways: runwaysList,
        frequencies: frequenciesList,
        metadata: {
          ...(isNoIcao ? { ourairports_id: num(apt.id) } : {}),
          created: existing?.metadata?.created || today,
          updated: today,
          sources: ["ourairports", "faa"],
        },
      };

      if (existing) {
        if (hasDataChanged(existing, incomingData)) {
          if (!checkOnly) {
            fs.writeFileSync(filePath, JSON.stringify(incomingData, null, 2));
          }
          console.log(`  UPDATED: ${filename}`);
          updated++;
        } else {
          unchanged++;
        }
      } else {
        if (!checkOnly) {
          fs.writeFileSync(filePath, JSON.stringify(incomingData, null, 2));
        }
        console.log(`  NEW: ${filename}`);
        added++;
      }
    }

    console.log("\nSummary:");
    console.log(`  New:              ${added}`);
    console.log(`  Updated:          ${updated}`);
    console.log(`  Unchanged:        ${unchanged}`);
    console.log(`  Skipped (collision): ${skipped}`);

    if (checkOnly) {
      console.log("\n(check-only mode — no files written)");
      if (added > 0 || updated > 0) {
        console.log("Changes detected. Run without --check to apply.");
        process.exit(1);
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})();
