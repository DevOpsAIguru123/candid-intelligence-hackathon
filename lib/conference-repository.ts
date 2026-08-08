import { createPostgresRepository } from "@/lib/repository-postgres";
import { createSqliteRepository } from "@/lib/repository-sqlite";
import type { ConferenceRepository } from "@/lib/repository-contract";

export * from "@/lib/repository-contract";
export * from "@/lib/conference-intelligence";
export { createPostgresRepository } from "@/lib/repository-postgres";

export function createRepository(path = "data/speaker-signal.db"): ConferenceRepository {
  return createSqliteRepository(path);
}

let defaultRepository: ConferenceRepository | undefined;

export function getRepository(): ConferenceRepository {
  if (!defaultRepository) {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (databaseUrl) {
      try {
        defaultRepository = createPostgresRepository(databaseUrl);
      } catch {
        throw new Error("Invalid DATABASE_URL configuration");
      }
    } else {
      defaultRepository = createRepository(process.env.DATABASE_PATH ?? "data/speaker-signal.db");
    }
  }
  return defaultRepository;
}
