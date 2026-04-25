import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { folders } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function POST() {
  ensureDbInitialized();

  // Get all folders, ordered by fileCount desc so we keep the one with most files
  const allFolders = await db
    .select()
    .from(folders)
    .orderBy(desc(folders.fileCount), desc(folders.createdAt));

  const seen = new Map<string, string>(); // name -> kept folderId
  const toDelete: { id: string; name: string }[] = [];

  for (const f of allFolders) {
    if (seen.has(f.name)) {
      toDelete.push({ id: f.id, name: f.name });
    } else {
      seen.set(f.name, f.id);
    }
  }

  // Delete duplicates from database only (cascade will remove related files records)
  // IMPORTANT: Never delete source files from disk - read-only access
  for (const dup of toDelete) {
    await db.delete(folders).where(eq(folders.id, dup.id));
  }

  return NextResponse.json({
    removed: toDelete.length,
    kept: seen.size,
    removedFolders: toDelete,
  });
}
