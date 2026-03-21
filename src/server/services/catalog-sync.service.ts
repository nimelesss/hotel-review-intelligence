import { getRepository } from "@/server/repositories";
import {
  CatalogHotelRecord,
  getCatalogSourceConfig,
  loadRussiaHotelsCatalog
} from "@/server/catalog/catalog-loader";
import { upsertHotelCatalog } from "@/server/search/hotel-search-cache";

export interface CatalogSyncReadiness {
  sourceConfigured: boolean;
  source?: string;
  hotelsInSystem: number;
}

export interface CatalogSyncResult {
  source: string;
  totalRows: number;
  importedRows: number;
  createdHotels: number;
  existingHotels: number;
  failedRows: number;
  warnings: string[];
  syncedAt: string;
  hotelsInSystem: number;
}

export function getCatalogSyncReadiness(): CatalogSyncReadiness {
  const repository = getRepository();
  const source = getCatalogSourceConfig();
  return {
    sourceConfigured: source.configured,
    source: source.source,
    hotelsInSystem: repository.listHotels().length
  };
}

export async function syncHotelsCatalog(limit?: number): Promise<CatalogSyncResult> {
  const repository = getRepository();
  const loaded = await loadRussiaHotelsCatalog(limit);
  const existing = repository.listHotels();

  const byExternalId = new Set(
    existing
      .map((hotel) => hotel.externalId?.trim())
      .filter((value): value is string => !!value)
  );
  const byNameCity = new Set(existing.map((hotel) => makeNameCityKey(hotel.name, hotel.city)));

  let createdHotels = 0;
  let existingHotels = 0;
  let failedRows = 0;
  const warnings: string[] = [];

  const importedForSearch = loaded.records.map((record) => ({
    externalId: record.externalId,
    name: record.name,
    city: record.city,
    country: record.country,
    address: record.address,
    coordinates: record.coordinates,
    source: "catalog_import" as const
  }));

  if (importedForSearch.length) {
    upsertHotelCatalog(importedForSearch);
  }

  loaded.records.forEach((record, index) => {
    try {
      const wasExisting = hasHotelInIndex(record, byExternalId, byNameCity);

      const created = repository.createHotel({
        name: record.name,
        city: record.city,
        country: record.country,
        address: record.address,
        coordinates: record.coordinates,
        externalId: record.externalId,
        brand: "Независимый отель",
        category: "4*",
        description:
          "Профиль загружен из централизованного каталога отелей РФ для дальнейшего автоматического сбора отзывов."
      });

      const ext = (created.externalId || record.externalId || "").trim();
      if (ext) {
        byExternalId.add(ext);
      }
      byNameCity.add(makeNameCityKey(created.name, created.city));

      if (wasExisting) {
        existingHotels += 1;
      } else {
        createdHotels += 1;
      }
    } catch (error) {
      failedRows += 1;
      if (warnings.length < 50) {
        warnings.push(
          `Строка каталога #${index + 1} (${record.name}, ${record.city}) пропущена: ${
            error instanceof Error ? error.message : "неизвестная ошибка"
          }`
        );
      }
    }
  });

  return {
    source: loaded.source,
    totalRows: loaded.totalRows,
    importedRows: loaded.records.length,
    createdHotels,
    existingHotels,
    failedRows,
    warnings,
    syncedAt: new Date().toISOString(),
    hotelsInSystem: repository.listHotels().length
  };
}

function hasHotelInIndex(
  record: CatalogHotelRecord,
  byExternalId: Set<string>,
  byNameCity: Set<string>
): boolean {
  if (record.externalId && byExternalId.has(record.externalId.trim())) {
    return true;
  }
  return byNameCity.has(makeNameCityKey(record.name, record.city));
}

function makeNameCityKey(name: string, city: string): string {
  return `${name.toLocaleLowerCase("ru-RU").trim()}|${city.toLocaleLowerCase("ru-RU").trim()}`;
}
