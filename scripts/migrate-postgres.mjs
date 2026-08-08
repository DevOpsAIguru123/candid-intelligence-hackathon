import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sanitizeError(error, sensitiveValue) {
  const message = error instanceof Error ? error.message : String(error);
  const withoutExactValue = sensitiveValue
    ? message.split(sensitiveValue).join("[redacted-url]")
    : message;
  return withoutExactValue
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[redacted]")
    .replace(/https?:\/\/[^\s]+/gi, "[redacted-url]");
}

async function runMigration() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    console.error("Error: DATABASE_URL environment variable is required to run migrations.");
    process.exitCode = 1;
    return;
  }

  const migrationsDirectory = path.resolve(__dirname, "../db/migrations");
  let sql;
  try {
    const entries = await readdir(migrationsDirectory, { withFileTypes: true });
    const migrationFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => entry.name)
      .sort();

    if (migrationFiles.length === 0) {
      throw new Error("No SQL migration files found.");
    }

    sql = postgres(connectionString, {
      ssl: "require",
      prepare: false,
      max: 1,
    });

    for (const filename of migrationFiles) {
      const migrationSql = await readFile(path.join(migrationsDirectory, filename), "utf8");
      await sql.unsafe(migrationSql);
      console.log(filename);
    }
  } catch (error) {
    console.error("Migration failed:", sanitizeError(error, connectionString));
    process.exitCode = 1;
  } finally {
    if (sql) {
      try {
        await sql.end();
      } catch {
        // Suppress cleanup error on exit.
      }
    }
  }
}

void runMigration().catch((error) => {
  console.error("Fatal migration error:", sanitizeError(error, process.env.DATABASE_URL));
  process.exitCode = 1;
});
