import { createPostgresRepository } from "@/lib/repository-postgres";
import { createSqliteRepository } from "@/lib/repository-sqlite";
import type { ConferenceRepository } from "@/lib/repository-contract";

export * from "@/lib/repository-contract";
export * from "@/lib/conference-intelligence";
export { createPostgresRepository } from "@/lib/repository-postgres";

export function createRepository(path = "data/speaker-signal.db"): ConferenceRepository {
  return createSqliteRepository(path);
}

/**
 * Cached on globalThis so a dev hot reload reuses the existing connection
 * pool. Re-instantiating one per reload exhausted the pooler client limit.
 */
const globalForRepository = globalThis as typeof globalThis & {
  __speakerSignalRepository?: ConferenceRepository;
};

export function getRepository(): ConferenceRepository {
  if (!globalForRepository.__speakerSignalRepository) {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (databaseUrl) {
      try {
        globalForRepository.__speakerSignalRepository = createPostgresRepository(databaseUrl);
      } catch {
        throw new Error("Invalid DATABASE_URL configuration");
      }
    } else {
      globalForRepository.__speakerSignalRepository = createRepository(
        process.env.DATABASE_PATH ?? "data/speaker-signal.db",
      );
    }
  }
  return globalForRepository.__speakerSignalRepository;
}
