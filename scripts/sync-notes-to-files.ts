/**
 * Migration script: Sync all existing notes from database to Markdown files
 * Run with: npx tsx scripts/sync-notes-to-files.ts
 */

import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { notes, noteTagRelations, noteTags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { syncAllNotesToFile } from "@/lib/notes/file-sync";

async function migrate() {
  console.log("🚀 Starting notes migration to Markdown files...");
  
  ensureDbInitialized();

  // Fetch all notes
  const allNotes = await db.select().from(notes);
  console.log(`📝 Found ${allNotes.length} notes in database`);

  if (allNotes.length === 0) {
    console.log("✅ No notes to migrate");
    return;
  }

  // Fetch tags for all notes
  const notesWithTags = await Promise.all(
    allNotes.map(async (note) => {
      const tags = await db
        .select({ name: noteTags.name, color: noteTags.color })
        .from(noteTagRelations)
        .innerJoin(noteTags, eq(noteTagRelations.tagId, noteTags.id))
        .where(eq(noteTagRelations.noteId, note.id));

      return {
        id: note.id,
        title: note.title,
        content: note.content,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        tags,
      };
    })
  );

  // Sync to files
  const savedPaths = syncAllNotesToFile(notesWithTags);
  
  console.log(`✅ Successfully migrated ${savedPaths.length} notes to Markdown files`);
  console.log("📁 Files saved to: notes/");
  console.log("\nMigrated files:");
  savedPaths.forEach((path) => console.log(`  - ${path}`));
}

migrate().catch((error) => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});
