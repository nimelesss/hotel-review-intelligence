#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_OUTPUT = "data/russia-hotels-catalog.json";
const DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const DEFAULT_LAT_STEP = 6;
const DEFAULT_LON_STEP = 8;
const DEFAULT_DELAY_MS = 350;
const DEFAULT_TIMEOUT_SEC = 120;
const DEFAULT_MAX_TILES = 180;
const DEFAULT_LIMIT = 120000;

const args = parseArgs(process.argv.slice(2));
const outputPath = path.resolve(process.cwd(), args.output || DEFAULT_OUTPUT);
const overpassUrl = args.overpassUrl || process.env.OVERPASS_API_URL || DEFAULT_OVERPASS_URL;
const latStep = asNumber(args.latStep, DEFAULT_LAT_STEP);
const lonStep = asNumber(args.lonStep, DEFAULT_LON_STEP);
const delayMs = asNumber(args.delayMs, DEFAULT_DELAY_MS);
const timeoutSec = asNumber(args.timeoutSec, DEFAULT_TIMEOUT_SEC);
const maxTiles = asNumber(args.maxTiles, DEFAULT_MAX_TILES);
const maxHotels = asNumber(args.limit, DEFAULT_LIMIT);

const tiles = buildRussiaTiles(latStep, lonStep).slice(0, maxTiles);

console.log(`[catalog] tiles planned: ${tiles.length}`);
console.log(`[catalog] overpass: ${overpassUrl}`);

const byExternalId = new Map();
const byNameCity = new Map();
let processedTiles = 0;

for (const tile of tiles) {
  if (byExternalId.size >= maxHotels) {
    break;
  }

  processedTiles += 1;
  console.log(
    `[catalog] tile ${processedTiles}/${tiles.length}: ${tile.south},${tile.west},${tile.north},${tile.east}`
  );

  const query = buildOverpassQuery(tile, timeoutSec);
  let payload;
  try {
    payload = await fetchTile(overpassUrl, query);
  } catch (error) {
    console.error(
      `[catalog] tile failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    continue;
  }

  const elements = Array.isArray(payload?.elements) ? payload.elements : [];

  for (const element of elements) {
    const normalized = normalizeElement(element);
    if (!normalized) {
      continue;
    }

    if (!byExternalId.has(normalized.externalId)) {
      byExternalId.set(normalized.externalId, normalized);
    }

    const key = `${normalizeForKey(normalized.name)}|${normalizeForKey(normalized.city)}|${normalizeForKey(normalized.address)}`;
    if (!byNameCity.has(key)) {
      byNameCity.set(key, normalized.externalId);
    }
  }

  if (delayMs > 0) {
    await sleep(delayMs);
  }
}

const uniqueByNameCity = [];
for (const externalId of byNameCity.values()) {
  const item = byExternalId.get(externalId);
  if (item) {
    uniqueByNameCity.push(item);
  }
}

const limited = uniqueByNameCity.slice(0, maxHotels);
const output = {
  generatedAt: new Date().toISOString(),
  source: "osm_overpass",
  overpassUrl,
  tilesProcessed: processedTiles,
  items: limited
};

const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, JSON.stringify(output), "utf8");
console.log(`[catalog] saved: ${outputPath}`);
console.log(`[catalog] hotels: ${limited.length}`);

function buildRussiaTiles(latStepValue, lonStepValue) {
  const regions = [
    { south: 41, north: 82, west: 19, east: 180 },
    { south: 60, north: 72, west: -180, east: -168 }
  ];

  const tilesResult = [];
  for (const region of regions) {
    for (let lat = region.south; lat < region.north; lat += latStepValue) {
      for (let lon = region.west; lon < region.east; lon += lonStepValue) {
        tilesResult.push({
          south: roundCoord(lat),
          north: roundCoord(Math.min(lat + latStepValue, region.north)),
          west: roundCoord(lon),
          east: roundCoord(Math.min(lon + lonStepValue, region.east))
        });
      }
    }
  }

  return tilesResult;
}

function buildOverpassQuery(tile, timeoutSecValue) {
  const bbox = `${tile.south},${tile.west},${tile.north},${tile.east}`;
  return `
[out:json][timeout:${Math.max(30, timeoutSecValue)}];
(
  node["tourism"~"^(hotel|hostel|guest_house|motel|apartment|resort)$"](${bbox});
  way["tourism"~"^(hotel|hostel|guest_house|motel|apartment|resort)$"](${bbox});
  relation["tourism"~"^(hotel|hostel|guest_house|motel|apartment|resort)$"](${bbox});
);
out center tags;
`;
}

async function fetchTile(url, query) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body: new URLSearchParams({ data: query }),
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`[catalog] overpass error ${response.status}: ${body.slice(0, 200)}`);
  }

  return response.json();
}

function normalizeElement(element) {
  if (!element || typeof element !== "object") {
    return null;
  }

  const type = asString(element.type);
  const id = asString(element.id);
  const tags = asObject(element.tags);

  const name = clean(
    asString(tags["name:ru"]) || asString(tags.name) || asString(tags["brand"]) || ""
  );
  const city = clean(
    asString(tags["addr:city"]) ||
      asString(tags["addr:town"]) ||
      asString(tags["addr:village"]) ||
      asString(tags["addr:municipality"]) ||
      asString(tags["is_in:city"]) ||
      asString(tags["addr:state_district"]) ||
      asString(tags["addr:region"]) ||
      ""
  );

  if (!type || !id || !name || !city) {
    return null;
  }

  const street = clean(asString(tags["addr:street"]) || asString(tags["addr:place"]) || "");
  const house = clean(asString(tags["addr:housenumber"]) || "");
  const postcode = clean(asString(tags["addr:postcode"]) || "");

  const lat = toNumber(element.lat) ?? toNumber(asObject(element.center).lat);
  const lon = toNumber(element.lon) ?? toNumber(asObject(element.center).lon);

  const addressParts = [
    street && house ? `${street}, ${house}` : street || house,
    city,
    clean(asString(tags["addr:state"]) || asString(tags["addr:region"]) || ""),
    postcode,
    "Россия"
  ].filter(Boolean);

  return {
    externalId: `osm-${type}-${id}`,
    name,
    city,
    country: "Россия",
    address: addressParts.join(", "),
    coordinates:
      Number.isFinite(lat) && Number.isFinite(lon)
        ? {
            lat,
            lon
          }
        : undefined
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function asNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function asObject(value) {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value;
}

function asString(value) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function clean(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForKey(value) {
  return clean(value).toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

function roundCoord(value) {
  return Math.round(value * 1000) / 1000;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
