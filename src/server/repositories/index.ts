import { InMemoryIntelligenceRepository } from "@/server/repositories/memory/repository";
import { IntelligenceRepository } from "@/server/repositories/types";

let repository: IntelligenceRepository | null = null;

export function getRepository(): IntelligenceRepository {
  if (!repository) {
    repository = new InMemoryIntelligenceRepository();
  }
  return repository;
}
