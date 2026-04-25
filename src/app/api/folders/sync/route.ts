import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { folders, files } from "@/lib/db/schema";
import { eq, count, inArray, not } from "drizzle-orm";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createReadStream } from "fs";

/**
 * SYNC API - READ-ONLY ACCESS TO SOURCE FILES
 *
 * This module only reads source files for scanning and content hashing.
 * It NEVER modifies, copies, or deletes any source files.
 * All file operations are read-only for maximum data safety.
 *
 * When files are removed from database (due to deletion from source folder),
 * only the database records are deleted - source files remain untouched.
 */

const SUPPORTED_EXTENSIONS = new Set([
  "pdf", "docx", "doc", "txt", "md", "markdown",
  "rtf", "odt", "csv", "json", "xml", "html", "htm",
  "pptx", "ppt", "xlsx", "xls", "epub",
]);

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
};

export async function POST() {
  ensureDbInitialized();
  const syncStartTime = Date.now();

  // Get all folders
  const allFolders = await db.select().from(folders);
  console.log(`[Sync] Starting sync for ${allFolders.length} folders`);

  const results: Array<{
    folderId: string;
    folderName: string;
    added: number;
    removed: number;
    error?: string;
  }> = [];

  for (const folder of allFolders) {
    // Skip browser-uploaded folders (they don't have server-side paths to sync)
    if (folder.path.startsWith("/浏览器上传/")) {
      console.log(`[Sync] Skipping browser folder: ${folder.name}`);
      continue;
    }

    // Check if folder path exists
    if (!fs.existsSync(folder.path)) {
      console.log(`[Sync] Folder path not found: ${folder.path}`);
      results.push({
        folderId: folder.id,
        folderName: folder.name,
        added: 0,
        removed: 0,
        error: "路径不存在",
      });
      continue;
    }

    try {
      console.log(`[Sync] Scanning folder: ${folder.path}`);
      const scanStartTime = Date.now();
      
      // Scan current files in folder
      const currentFiles = scanDirectory(folder.path, "");
      const scanTime = Date.now() - scanStartTime;
      console.log(`[Sync] Found ${currentFiles.length} files in ${folder.name} (${scanTime}ms)`);
      
      const currentHashes = new Set(currentFiles.map((f) => f.hash));

      // Get existing files from database
      const existingFiles = await db
        .select({ id: files.id, contentHash: files.contentHash })
        .from(files)
        .where(eq(files.folderId, folder.id));

      const existingHashes = new Set<string>(existingFiles.map((f) => f.contentHash).filter(Boolean) as string[]);
      const existingIdByHash = new Map<string, string>(
        existingFiles.filter(f => f.contentHash).map((f) => [f.contentHash as string, f.id])
      );

      // Find new files (in folder but not in DB)
      const newFiles = currentFiles.filter((f) => !existingHashes.has(f.hash));
      console.log(`[Sync] New files to add: ${newFiles.length}`);

      // Find deleted files (in DB but not in folder)
      const deletedHashes = [...existingHashes].filter(
        (h) => !currentHashes.has(h)
      );
      console.log(`[Sync] Files to remove: ${deletedHashes.length}`);
      const deletedIds = deletedHashes
        .map((h) => existingIdByHash.get(h))
        .filter(Boolean) as string[];

      // Add new files
      const now = Date.now();
      for (const fileInfo of newFiles) {
        await db.insert(files).values({
          id: nanoid(),
          folderId: folder.id,
          relativePath: fileInfo.relativePath,
          fileName: fileInfo.name,
          extension: fileInfo.ext,
          mimeType: MIME_MAP[fileInfo.ext] || null,
          sizeBytes: fileInfo.size,
          contentHash: fileInfo.hash,
          status: "discovered",
          createdAt: now,
          updatedAt: now,
        });
      }

      // Remove deleted files
      if (deletedIds.length > 0) {
        await db.delete(files).where(inArray(files.id, deletedIds));
      }

      // Update folder file count
      const [countResult] = await db
        .select({ count: count() })
        .from(files)
        .where(eq(files.folderId, folder.id));

      await db
        .update(folders)
        .set({
          fileCount: countResult.count,
          updatedAt: now,
        })
        .where(eq(folders.id, folder.id));

      results.push({
        folderId: folder.id,
        folderName: folder.name,
        added: newFiles.length,
        removed: deletedIds.length,
      });
    } catch (error) {
      results.push({
        folderId: folder.id,
        folderName: folder.name,
        added: 0,
        removed: 0,
        error: String(error),
      });
    }
  }

  // Check if any changes occurred
  const hasChanges = results.some((r) => r.added > 0 || r.removed > 0);
  const totalSyncTime = Date.now() - syncStartTime;
  console.log(`[Sync] Total sync time: ${totalSyncTime}ms`);

  return NextResponse.json({
    success: true,
    hasChanges,
    syncedFolders: results.length,
    results,
    totalSyncTime,
  });
}

interface ScannedFile {
  name: string;
  relativePath: string;
  ext: string;
  size: number;
  hash: string;
  mtime: number; // 修改时间
}

function scanDirectory(basePath: string, relativePath: string): ScannedFile[] {
  const results: ScannedFile[] = [];
  const fullPath = relativePath ? path.join(basePath, relativePath) : basePath;

  try {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files/directories
      if (entry.name.startsWith(".")) continue;

      const entryRelativePath = relativePath
        ? `${relativePath}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        results.push(...scanDirectory(basePath, entryRelativePath));
      } else if (entry.isFile()) {
        const ext = entry.name.split(".").pop()?.toLowerCase() || "";
        if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

        const filePath = path.join(fullPath, entry.name);
        const stat = fs.statSync(filePath);

        // 优化：使用文件名+文件大小+修改时间作为快速哈希（避免读取大文件）
        // 格式：name-size-mtime（三重校验，几乎零误判）
        const hash = `${entry.name}-${stat.size}-${stat.mtimeMs}`;

        results.push({
          name: entry.name,
          relativePath: entryRelativePath,
          ext,
          size: stat.size,
          hash,
          mtime: stat.mtimeMs,
        });
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return results;
}
