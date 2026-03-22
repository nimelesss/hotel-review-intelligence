#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { parse as parseCsv } from "csv-parse/sync";

const OUTPUT_PATH = path.resolve(
  process.cwd(),
  "data/open-datasets/discovery-report.json"
);

const KAGGLE_QUERIES = [
  "yandex geo reviews",
  "2gis reviews",
  "ostrovok hotels",
  "hotel reviews russia",
  "travel reviews russia",
  "hotel reviews dataset"
];

const HF_QUERIES = [
  "yandex geo reviews",
  "2gis reviews",
  "hotel reviews russian",
  "hotel reviews"
];

const GITHUB_QUERIES = [
  "yandex geo reviews dataset",
  "2gis reviews dataset",
  "ostrovok hotel dataset",
  "hotel reviews russia dataset"
];

const ACCOMMODATION_MARKERS = [
  "отель",
  "гостиниц",
  "hotel",
  "hostel",
  "апарт",
  "гостевой дом",
  "санатор",
  "база отдыха",
  "resort",
  "inn"
];

const REVIEW_MARKERS = ["review", "отзыв", "feedback", "ratings", "geo reviews"];

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    sources: {
      kaggle: await discoverKaggle(),
      huggingface: await discoverHuggingFace(),
      github: await discoverGithub()
    }
  };

  const all = [
    ...report.sources.kaggle.items,
    ...report.sources.huggingface.items,
    ...report.sources.github.items
  ];
  const deduped = dedupeCandidates(all);

  const ranked = deduped
    .map((item) => ({
      ...item,
      relevanceScore: scoreCandidate(item)
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  const payload = {
    generatedAt: report.generatedAt,
    summary: {
      totalCandidates: ranked.length,
      highPriority: ranked.filter((item) => item.relevanceScore >= 80).length,
      mediumPriority: ranked.filter(
        (item) => item.relevanceScore >= 50 && item.relevanceScore < 80
      ).length
    },
    topCandidates: ranked.slice(0, 80),
    raw: report.sources
  };

  ensureDirectory(OUTPUT_PATH);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[discover-open-datasets] saved ${OUTPUT_PATH}`);
  console.log(
    `[discover-open-datasets] total=${payload.summary.totalCandidates} high=${payload.summary.highPriority}`
  );
}

async function discoverKaggle() {
  const items = [];
  const errors = [];

  for (const query of KAGGLE_QUERIES) {
    try {
      const stdout = execFileSync(
        "kaggle",
        ["datasets", "list", "-s", query, "--csv", "-p", "1"],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env
          }
        }
      );
      const rows = parseCsv(stdout, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        skip_records_with_error: true,
        bom: true
      });
      for (const row of rows.slice(0, 40)) {
        if (!row.ref) {
          continue;
        }
        items.push({
          source: "kaggle",
          id: row.ref,
          title: row.title || "",
          description: "",
          lastUpdated: row.lastUpdated || "",
          downloads: Number(row.downloadCount || 0),
          likes: Number(row.voteCount || 0),
          link: row.ref ? `https://www.kaggle.com/datasets/${row.ref}` : "",
          query
        });
      }
    } catch (error) {
      errors.push({
        query,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    queries: KAGGLE_QUERIES,
    items,
    errors
  };
}

async function discoverHuggingFace() {
  const items = [];
  const errors = [];

  for (const query of HF_QUERIES) {
    const url = `https://huggingface.co/api/datasets?search=${encodeURIComponent(
      query
    )}&limit=60`;
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const rows = await response.json();
      if (!Array.isArray(rows)) {
        continue;
      }
      for (const row of rows) {
        items.push({
          source: "huggingface",
          id: row.id || "",
          title: row.id || "",
          description: row.description || "",
          lastUpdated: row.lastModified || "",
          downloads: Number(row.downloads || 0),
          likes: Number(row.likes || 0),
          link: row.id ? `https://huggingface.co/datasets/${row.id}` : "",
          query
        });
      }
    } catch (error) {
      errors.push({
        query,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    queries: HF_QUERIES,
    items,
    errors
  };
}

async function discoverGithub() {
  const items = [];
  const errors = [];

  for (const query of GITHUB_QUERIES) {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(
      query
    )}&sort=stars&order=desc&per_page=30`;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "hotel-review-intelligence-discovery"
        },
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      const rows = Array.isArray(payload.items) ? payload.items : [];
      for (const row of rows) {
        items.push({
          source: "github",
          id: row.full_name || "",
          title: row.name || "",
          description: row.description || "",
          lastUpdated: row.updated_at || "",
          downloads: 0,
          likes: Number(row.stargazers_count || 0),
          link: row.html_url || "",
          query
        });
      }
    } catch (error) {
      errors.push({
        query,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    queries: GITHUB_QUERIES,
    items,
    errors
  };
}

function dedupeCandidates(items) {
  const map = new Map();
  for (const item of items) {
    const key = `${item.source}:${item.id}`.toLowerCase();
    if (!key || key.endsWith(":")) {
      continue;
    }
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }
    map.set(key, {
      ...existing,
      downloads: Math.max(existing.downloads || 0, item.downloads || 0),
      likes: Math.max(existing.likes || 0, item.likes || 0),
      lastUpdated:
        existing.lastUpdated && item.lastUpdated
          ? existing.lastUpdated > item.lastUpdated
            ? existing.lastUpdated
            : item.lastUpdated
          : existing.lastUpdated || item.lastUpdated,
      query: `${existing.query}; ${item.query}`
    });
  }
  return [...map.values()];
}

function scoreCandidate(item) {
  const text = `${item.id} ${item.title} ${item.description} ${item.query}`.toLowerCase();
  let score = 0;

  for (const marker of ACCOMMODATION_MARKERS) {
    if (text.includes(marker)) {
      score += 20;
    }
  }
  for (const marker of REVIEW_MARKERS) {
    if (text.includes(marker)) {
      score += 14;
    }
  }
  if (text.includes("russia") || text.includes("росси")) {
    score += 18;
  }
  if (text.includes("yandex")) {
    score += 16;
  }
  if (text.includes("2gis")) {
    score += 12;
  }
  if (text.includes("ostrovok")) {
    score += 12;
  }
  score += Math.min(30, Math.log10((item.downloads || 1) + 1) * 10);
  score += Math.min(16, Math.log10((item.likes || 1) + 1) * 8);

  return Math.round(score);
}

function ensureDirectory(filePath) {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

main().catch((error) => {
  console.error(
    `[discover-open-datasets] failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  process.exit(1);
});
