import { InMemoryIntelligenceRepository } from "@/server/repositories/memory/repository";
import { IntelligenceRepository } from "@/server/repositories/types";
import { SqliteIntelligenceRepository } from "@/server/repositories/sqlite/repository";

let repository: IntelligenceRepository | null = null;

export function getRepository(): IntelligenceRepository {
  if (!repository) {
    const driver = (process.env.REPOSITORY_DRIVER || "sqlite").trim().toLowerCase();
    if (driver === "memory") {
      repository = new InMemoryIntelligenceRepository();
      return repository;
    }

    try {
      repository = new SqliteIntelligenceRepository();
    } catch (error) {
      console.warn(
        `[repository] sqlite init failed, fallback to memory: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
      repository = new InMemoryIntelligenceRepository();
    }
  }
  return repository;
}
