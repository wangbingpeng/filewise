import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { folders, files, pipelineJobs } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { tryAcquireLock, releaseStaleLock } from "@/lib/pipeline/lock-manager";

/**
 * SCAN API - READ-ONLY ACCESS TO SOURCE FILES
 *
 * This module only reads source files for scanning and content hashing.
 * It NEVER modifies, copies, or deletes any source files.
 * All file operations are read-only for maximum data safety.
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

export async function POST(request: Request) {
  ensureDbInitialized();
  
  // Release stale locks on startup
  await releaseStaleLock();
  
  const body = await request.json();
  const { folderId } = body;

  if (!folderId) {
    return NextResponse.json({ error: "folderId 不能为空" }, { status: 400 });
  }

  // Try to acquire lock
  const lockResult = await tryAcquireLock(folderId);
  if (!lockResult.success) {
    return NextResponse.json({ error: lockResult.error }, { status: 409 });
  }

  const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
  if (!folder) {
    return NextResponse.json({ error: "文件夹不存在" }, { status: 404 });
  }

  // Create pipeline job
  const jobId = nanoid();
  const now = Date.now();
  await db.insert(pipelineJobs).values({
    id: jobId,
    folderId,
    stage: "scan",
    status: "running",
    totalItems: 0,
    processedItems: 0,
    startedAt: now,
    createdAt: now,
  });

  // Update folder status
  await db.update(folders).set({ status: "scanning", updatedAt: Date.now() }).where(eq(folders.id, folderId));

  try {
    const folderPath = folder.path;

    // Check if the path exists on the server
    if (!fs.existsSync(folderPath)) {
      await db.update(folders).set({ status: "error", updatedAt: Date.now() }).where(eq(folders.id, folderId));
      return NextResponse.json({ error: `路径不存在: ${folderPath}` }, { status: 400 });
    }

    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      await db.update(folders).set({ status: "error", updatedAt: Date.now() }).where(eq(folders.id, folderId));
      return NextResponse.json({ error: "路径不是一个目录" }, { status: 400 });
    }

    // Recursively scan directory
    const discoveredFiles = scanDirectory(folderPath, "");
    const now = Date.now();
    let newCount = 0;

    for (const fileInfo of discoveredFiles) {
      // Check if file already exists by content hash
      const existing = await db.select({ id: files.id })
        .from(files)
        .where(eq(files.contentHash, fileInfo.hash))
        .limit(1);

      if (existing.length > 0) continue;

      await db.insert(files).values({
        id: nanoid(),
        folderId,
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
      newCount++;
    }

    // Update folder stats
    const [fileCountResult] = await db.select({ count: count() }).from(files).where(eq(files.folderId, folderId));
    await db.update(folders).set({
      fileCount: fileCountResult.count,
      status: "ready",
      updatedAt: Date.now(),
    }).where(eq(folders.id, folderId));

    // Update job status
    await db.update(pipelineJobs).set({
      status: "completed",
      totalItems: discoveredFiles.length,
      processedItems: discoveredFiles.length,
      completedAt: Date.now(),
    }).where(eq(pipelineJobs.id, jobId));

    return NextResponse.json({
      success: true,
      jobId,
      totalScanned: discoveredFiles.length,
      newFiles: newCount,
      totalFiles: fileCountResult.count,
    });
  } catch (error) {
    await db.update(folders).set({ status: "error", updatedAt: Date.now() }).where(eq(folders.id, folderId));
    await db.update(pipelineJobs).set({
      status: "failed",
      errorLog: JSON.stringify([{ error: String(error), timestamp: Date.now() }]),
      completedAt: Date.now(),
    }).where(eq(pipelineJobs.id, jobId));
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

interface ScannedFile {
  name: string;
  relativePath: string;
  ext: string;
  size: number;
  hash: string;
}

function scanDirectory(basePath: string, relativePath: string): ScannedFile[] {
  const results: ScannedFile[] = [];
  const fullPath = relativePath ? path.join(basePath, relativePath) : basePath;

  try {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files/directories
      if (entry.name.startsWith(".")) continue;

      const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        results.push(...scanDirectory(basePath, entryRelativePath));
      } else if (entry.isFile()) {
        const ext = entry.name.split(".").pop()?.toLowerCase() || "";
        if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

        const filePath = path.join(fullPath, entry.name);
        const stat = fs.statSync(filePath);

        // Compute SHA-256 hash
        const fileBuffer = fs.readFileSync(filePath);
        const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

        results.push({
          name: entry.name,
          relativePath: entryRelativePath,
          ext,
          size: stat.size,
          hash,
        });
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return results;
}
