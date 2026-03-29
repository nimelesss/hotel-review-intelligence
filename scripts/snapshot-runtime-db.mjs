#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = process.cwd();
const RUNTIME_DIR = path.join(ROOT, "data", "runtime");
const SEED_DIR = path.join(ROOT, "src", "data", "seeds", "runtime-db");

const targets = [
  {
    name: "hotel_catalog",
    sourcePath: path.join(RUNTIME_DIR, "hotel_catalog.sqlite"),
    seedPath: path.join(SEED_DIR, "hotel_catalog.sqlite.gz"),
    minBytes: 1024 * 1024
  },
  {
    name: "review_intelligence",
    sourcePath: path.join(RUNTIME_DIR, "review_intelligence.sqlite"),
    seedPath: path.join(SEED_DIR, "review_intelligence.sqlite.gz"),
    minBytes: 2 * 1024 * 1024
  }
];

function ensureDirectory(filePath) {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function fileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function snapshotTarget(target) {
  if (!fs.existsSync(target.sourcePath)) {
    throw new Error(`Runtime DB file not found: ${target.sourcePath}`);
  }
  const sourceBytes = fileSize(target.sourcePath);
  if (sourceBytes < target.minBytes) {
    throw new Error(
      `Runtime DB file is too small (${sourceBytes} bytes): ${target.sourcePath}`
    );
  }

  const raw = fs.readFileSync(target.sourcePath);
  const gz = zlib.gzipSync(raw, { level: 9 });
  ensureDirectory(target.seedPath);
  fs.writeFileSync(target.seedPath, gz);

  return {
    target: target.name,
    sourcePath: target.sourcePath,
    seedPath: target.seedPath,
    sourceBytes,
    gzBytes: gz.length
  };
}

function main() {
  const summary = targets.map(snapshotTarget);
  process.stdout.write(
    `${JSON.stringify(
      {
        snappedAt: new Date().toISOString(),
        summary
      },
      null,
      2
    )}\n`
  );
}

main();
