/**
 * Migration script: Reorganize existing note files into folder structure
 * Run with: npx tsx scripts/migrate-notes-to-folders.ts
 */

import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { notes, noteFolders, noteTagRelations, noteTags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { syncAllNotesToFile, NOTES_DIR } from "@/lib/notes/file-sync";
import fs from "fs";
import path from "path";

async function migrate() {
  console.log("🚀 Starting notes folder structure migration...");
  
  ensureDbInitialized();

  // Fetch all folders
  const allFolders = await db.select().from(noteFolders);
  console.log(`📁 Found ${allFolders.length} folders`);

  // Fetch all notes with their tags
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
        folderId: note.folderId,
        tags,
        allFolders,
      };
    })
  );

  // Sync to files with folder structure
  const savedPaths = syncAllNotesToFile(notesWithTags);
  
  console.log(`\n✅ Successfully migrated ${savedPaths.length} notes to folder structure`);
  console.log("📁 Base directory:", NOTES_DIR);
  
  // Show folder structure
  console.log("\n📂 Folder structure:");
  printFolderStructure(NOTES_DIR, "");

  // Show notes per folder
  const folderStats = allFolders.map(folder => {
    const notesInFolder = notesWithTags.filter(n => n.folderId === folder.id);
    return { folder: folder.name, count: notesInFolder.length };
  });
  
  const notesWithoutFolder = notesWithTags.filter(n => !n.folderId).length;
  
  console.log("\n📊 Notes distribution:");
  folderStats.forEach(stat => {
    console.log(`  - ${stat.folder}: ${stat.count} notes`);
  });
  if (notesWithoutFolder > 0) {
    console.log(`  - (根目录): ${notesWithoutFolder} notes`);
  }
}

function printFolderStructure(dirPath: string, prefix: string) {
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      if (item.isDirectory()) {
        console.log(`${prefix}📁 ${item.name}`);
        printFolderStructure(
          path.join(dirPath, item.name),
          prefix + "  "
        );
      }
    }
  } catch (error) {
    // Ignore errors
  }
}

migrate().catch((error) => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});
