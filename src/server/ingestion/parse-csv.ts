import { IngestionRawRow } from "@/entities/types";

export function parseCsvPayload(payload: string): IngestionRawRow[] {
  const rows = payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length === 0) {
    return [];
  }

  const headers = splitCsvLine(rows[0]).map((header) => header.trim());

  return rows.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const mapped: IngestionRawRow = {};
    headers.forEach((header, index) => {
      mapped[header as keyof IngestionRawRow] = cells[index];
    });
    return mapped;
  });
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current.trim());

  return values;
}
