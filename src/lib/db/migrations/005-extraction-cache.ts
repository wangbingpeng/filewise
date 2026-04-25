import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export async function up() {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS extraction_cache (
      id TEXT PRIMARY KEY,
      content_hash TEXT NOT NULL,
      file_name TEXT NOT NULL,
      extension TEXT NOT NULL,
      raw_text TEXT NOT NULL DEFAULT '',
      char_count INTEGER NOT NULL DEFAULT 0,
      metadata TEXT,
      extracted_at INTEGER NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 1,
      last_accessed_at INTEGER NOT NULL
    )
  `);

  await db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS extraction_cache_hash_idx 
    ON extraction_cache(content_hash)
  `);

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS extraction_cache_extension_idx 
    ON extraction_cache(extension)
  `);

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS extraction_cache_accessed_idx 
    ON extraction_cache(last_accessed_at)
  `);

  console.log('[Migration] Created extraction_cache table');
}

export async function down() {
  await db.run(sql`DROP TABLE IF EXISTS extraction_cache`);
  console.log('[Migration] Dropped extraction_cache table');
}
