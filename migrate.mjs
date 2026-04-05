import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}

console.log("[migrate] Connecting to database...");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});
const db = drizzle(pool);

const migrationsFolder = join(__dirname, "drizzle", "migrations");
console.log("[migrate] Running migrations from:", migrationsFolder);

try {
  await migrate(db, { migrationsFolder });
  console.log("[migrate] Migrations applied successfully");
  await pool.end();
  process.exit(0);
} catch (error) {
  console.error("[migrate] Migration failed:", error);
  await pool.end();
  process.exit(1);
}
