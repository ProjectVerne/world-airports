#!/usr/bin/env node
/**
 * from-ourairports.js — bootstraps airport JSON files from OurAirports CSV data
 *
 * OurAirports publishes CC0-licensed CSVs at:
 *   https://ourairports.com/data/airports.csv
 *   https://ourairports.com/data/runways.csv
 *   https://ourairports.com/data/airport-frequencies.csv
 *
 * Usage:
 *   node scripts/import/from-ourairports.js [--airports path] [--runways path] [--frequencies path] [--out dir]
 *
 * Flags:
 *   --airports     Path to airports.csv (downloaded from OurAirports)
 *   --runways      Path to runways.csv
 *   --frequencies  Path to airport-frequencies.csv
 *   --out          Output directory (default: data/airports)
 *   --dry-run      Print stats without writing files
 *
 * Download the CSVs first:
 *   curl -O https://ourairports.com/data/airports.csv
 *   curl -O https://ourairports.com/data/runways.csv
 *   curl -O https://ourairports.com/data/airport-frequencies.csv
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const DEFAULT_OUT = path.join(__dirname, "..", "..", "data", "airports");

// --- Argument parsing ---
const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}
const dryRun = args.includes("--dry-run");
const airportsCsvPath = getArg("--airports");
const runwaysCsvPath = getArg("--runways");
const freqCsvPath = getArg("--frequencies");
const outDir = getArg("--out") || DEFAULT_OUT;

if (!airportsCsvPath) {
  console.error("Error: --airports <path> is required");
  console.error("Download from: https://ourairports.com/data/airports.csv");
  process.exit(1);
}

// --- CSV parser (simple, handles quoted fields) ---
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

// --- Helpers ---
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
  // No valid ICAO — use _<country>_<ourairports_id>
  const country = (strOrNull(airport.iso_country) || "xx").toLowerCase().slice(0, 2);
  const id = String(airport.id).padStart(5, "0");
  return `_${country}_${id}`;
}

const today = new Date().toISOString().slice(0, 10);

// --- Main ---
(async () => {
  console.log("Loading airports CSV...");
  const airports = await parseCsv(airportsCsvPath);
  console.log(`  ${airports.length} airports loaded`);

  // Index runways by ident
  const runwaysByIdent = {};
  if (runwaysCsvPath) {
    console.log("Loading runways CSV...");
    const runways = await parseCsv(runwaysCsvPath);
    console.log(`  ${runways.length} runway entries loaded`);
    for (const rwy of runways) {
      const k = rwy.airport_ident?.toUpperCase();
      if (!k) continue;
      if (!runwaysByIdent[k]) runwaysByIdent[k] = [];
      runwaysByIdent[k].push(rwy);
    }
  }

  // Index frequencies by ident
  const freqsByIdent = {};
  if (freqCsvPath) {
    console.log("Loading frequencies CSV...");
    const freqs = await parseCsv(freqCsvPath);
    console.log(`  ${freqs.length} frequency entries loaded`);
    for (const freq of freqs) {
      const k = freq.airport_ident?.toUpperCase();
      if (!k) continue;
      if (!freqsByIdent[k]) freqsByIdent[k] = [];
      freqsByIdent[k].push(freq);
    }
  }

  if (!dryRun) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  let written = 0;
  let skipped = 0;
  const seenFilenames = new Set();

  for (const apt of airports) {
    const filename = icaoFilename(apt);
    const filePath = path.join(outDir, `${filename}.json`);

    // Handle collisions (should be rare)
    if (seenFilenames.has(filename)) {
      console.warn(`  COLLISION: ${filename} — skipping duplicate for airport id ${apt.id}`);
      skipped++;
      continue;
    }
    seenFilenames.add(filename);

    const ident = apt.gps_code?.trim().toUpperCase() || null;
    const oaRunways = runwaysByIdent[ident] || runwaysByIdent[apt.local_code?.trim().toUpperCase()] || [];
    const oaFreqs = freqsByIdent[ident] || freqsByIdent[apt.local_code?.trim().toUpperCase()] || [];

    const runways = oaRunways.map((rwy) => ({
      id: `${rwy.le_ident || "?"}/${rwy.he_ident || "?"}`,
      length_ft: num(rwy.length_ft) ?? 0,
      width_ft: num(rwy.width_ft) ?? 0,
      surface: surfaceFromOa(rwy.surface),
      lighted: bool(rwy.lighted),
      closed: bool(rwy.closed),
      ends: {
        low: {
          ident: strOrNull(rwy.le_ident) || "?",
          latitude: num(rwy.le_latitude_deg),
          longitude: num(rwy.le_longitude_deg),
          elevation_ft: num(rwy.le_elevation_ft),
          heading_true: num(rwy.le_heading_degT),
          displaced_threshold_ft: num(rwy.le_displaced_threshold_ft) ?? 0,
        },
        high: {
          ident: strOrNull(rwy.he_ident) || "?",
          latitude: num(rwy.he_latitude_deg),
          longitude: num(rwy.he_longitude_deg),
          elevation_ft: num(rwy.he_elevation_ft),
          heading_true: num(rwy.he_heading_degT),
          displaced_threshold_ft: num(rwy.he_displaced_threshold_ft) ?? 0,
        },
      },
    }));

    const frequencies = oaFreqs.map((freq) => ({
      type: freqTypeFromOa(freq.type),
      description: strOrNull(freq.description) || "",
      mhz: num(freq.frequency_mhz) ?? 0,
    }));

    const isNoIcao = filename.startsWith("_");

    const record = {
      icao: isNoIcao ? null : ident,
      iata: strOrNull(apt.iata_code),
      name: apt.name?.trim() || "Unknown",
      type: apt.type?.trim() || "small_airport",
      status: bool(apt.closed) ? "closed" : "open",
      location: {
        latitude: num(apt.latitude_deg),
        longitude: num(apt.longitude_deg),
        elevation_ft: num(apt.elevation_ft),
        continent: strOrNull(apt.continent),
        iso_country: strOrNull(apt.iso_country),
        iso_region: strOrNull(apt.iso_region),
        municipality: strOrNull(apt.municipality),
      },
      scheduled_service: bool(apt.scheduled_service),
      wikipedia: strOrNull(apt.wikipedia_link),
      keywords: apt.keywords ? apt.keywords.split(",").map((k) => k.trim()).filter(Boolean) : [],
      runways,
      frequencies,
      metadata: {
        ...(isNoIcao ? { ourairports_id: num(apt.id) } : {}),
        created: today,
        updated: today,
        sources: ["ourairports"],
      },
    };

    if (!dryRun) {
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
    }
    written++;
  }

  console.log(`\nDone. Written: ${written}  Skipped (collisions): ${skipped}`);
  if (dryRun) console.log("(dry run — no files written)");
})();
