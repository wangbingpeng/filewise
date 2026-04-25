import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { folders, files, fileContents } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { nanoid } from "nanoid";
import crypto from "crypto";
import mammoth from "mammoth";
import JSZip from "jszip";

/**
 * FILE UPLOAD API - NO DISK STORAGE
 *
 * Files uploaded via browser are processed in memory only:
 * 1. Phase 1: Scan and save metadata (file list, sizes, hashes)
 * 2. Phase 2: Process files sequentially (extract content)
 * 3. Never save files to disk - direct memory processing
 *
 * This ensures source files remain untouched and no duplicate copies are created.
 */

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
};

// All supported extensions
const SUPPORTED_EXTENSIONS = new Set([
  "pdf", "docx", "doc", "txt", "md", "markdown",
  "rtf", "odt", "csv", "json", "xml", "html", "htm",
  "pptx", "ppt", "xlsx", "xls", "epub",
]);

export async function POST(request: Request) {
  ensureDbInitialized();

  const formData = await request.formData();
  const folderId = formData.get("folderId") as string;
  const uploadedFiles = formData.getAll("files") as File[];
  const relativePaths = formData.getAll("paths") as string[];

  if (!folderId) {
    return NextResponse.json({ error: "folderId 不能为空" }, { status: 400 });
  }

  const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
  if (!folder) {
    return NextResponse.json({ error: "文件夹不存在" }, { status: 404 });
  }

  const now = Date.now();
  const fileDataList: Array<{
    fileId: string;
    buffer: Buffer;
    ext: string;
  }> = [];

  // ============================================
  // Phase 1: Scan - Save metadata for all files
  // ============================================
  for (let i = 0; i < uploadedFiles.length; i++) {
    const file = uploadedFiles[i];
    const relativePath = relativePaths[i] || file.name;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";

    // Skip unsupported extensions
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

    // Read file into memory
    const buffer = Buffer.from(await file.arrayBuffer());
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");

    // Check for duplicate by content hash
    const existing = await db.select({ id: files.id })
      .from(files)
      .where(eq(files.contentHash, hash))
      .limit(1);

    if (existing.length > 0) continue;

    const fileId = nanoid();

    // Insert file metadata
    await db.insert(files).values({
      id: fileId,
      folderId,
      relativePath,
      fileName: file.name,
      extension: ext,
      mimeType: MIME_MAP[ext] || file.type || null,
      sizeBytes: file.size,
      contentHash: hash,
      status: "discovered",
      createdAt: now,
      updatedAt: now,
    });

    // Store buffer for phase 2 processing
    fileDataList.push({ fileId, buffer, ext });
  }

  // ============================================
  // Phase 2: Process files sequentially
  // ============================================
  for (const { fileId, buffer, ext } of fileDataList) {
    try {
      const text = await extractTextFromBuffer(buffer, ext);

      if (text && text.trim().length > 0) {
        // Save extracted content
        await db.insert(fileContents).values({
          id: nanoid(),
          fileId,
          rawText: text,
          charCount: text.length,
          extractedAt: Date.now(),
        });

        // Update status to extracted
        await db.update(files)
          .set({ status: "extracted", updatedAt: Date.now() })
          .where(eq(files.id, fileId));
      }
    } catch (error) {
      console.error(`Failed to extract ${fileId}:`, error);
      // Status remains "discovered" for later retry
    }
  }

  // Update folder file count
  const [fileCountResult] = await db.select({ count: count() }).from(files).where(eq(files.folderId, folderId));
  await db.update(folders).set({
    fileCount: fileCountResult.count,
    status: "ready",
    updatedAt: Date.now(),
  }).where(eq(folders.id, folderId));

  return NextResponse.json({
    success: true,
    savedFiles: fileDataList.length,
    totalFiles: fileCountResult.count,
  });
}

/**
 * Extract text from buffer based on file extension
 */
async function extractTextFromBuffer(buffer: Buffer, ext: string): Promise<string> {
  switch (ext) {
    case "txt":
    case "md":
    case "markdown":
    case "json":
    case "csv":
    case "xml":
    case "html":
    case "htm":
      return buffer.toString("utf-8");

    case "pdf":
      return extractPdfFromBuffer(buffer);

    case "docx":
    case "doc":
      return extractDocxFromBuffer(buffer);

    case "pptx":
    case "ppt":
      return extractPptxFromBuffer(buffer);

    case "xlsx":
    case "xls":
      return extractXlsxFromBuffer(buffer);

    default:
      return "";
  }
}

async function extractPdfFromBuffer(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParseModule = require("pdf-parse");

  let pdfParse: ((buffer: Buffer) => Promise<{ text: string }>) | null = null;

  if (typeof pdfParseModule === "function") {
    pdfParse = pdfParseModule;
  } else if (pdfParseModule.default && typeof pdfParseModule.default === "function") {
    pdfParse = pdfParseModule.default;
  } else if (pdfParseModule.pdfParse && typeof pdfParseModule.pdfParse === "function") {
    pdfParse = pdfParseModule.pdfParse;
  }

  if (!pdfParse) {
    throw new Error("pdf-parse module format not recognized");
  }

  const data = await pdfParse(buffer);
  return data.text || "";
}

async function extractDocxFromBuffer(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

async function extractPptxFromBuffer(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slides: string[] = [];
  let slideIndex = 1;

  while (true) {
    const slideFile = zip.file(`ppt/slides/slide${slideIndex}.xml`);
    if (!slideFile) break;

    const content = await slideFile.async("text");
    const text = extractTextFromXml(content);
    if (text.trim()) {
      slides.push(`--- Slide ${slideIndex} ---\n${text}`);
    }
    slideIndex++;
  }

  return slides.join("\n\n");
}

function extractTextFromXml(xml: string): string {
  const textMatches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
  const texts = textMatches.map((match) => {
    const content = match.replace(/<a:t[^>]*>/, "").replace(/<\/a:t>$/, "");
    return decodeXmlEntities(content);
  });
  return texts.join(" ").replace(/\s+/g, " ").trim();
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function extractXlsxFromBuffer(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx");

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheets: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
    }) as unknown[][];

    if (jsonData.length === 0) continue;

    const sheetLines: string[] = [];
    sheetLines.push(`\n=== Sheet: ${sheetName} ===\n`);

    for (const row of jsonData) {
      const nonEmptyCells = row.filter(cell => cell !== "" && cell !== null && cell !== undefined);
      if (nonEmptyCells.length === 0) continue;

      const rowText = row
        .map(cell => {
          if (cell === null || cell === undefined) return "";
          if (typeof cell === "number") return cell.toString();
          if (cell instanceof Date) return cell.toISOString();
          return String(cell);
        })
        .join("\t");

      sheetLines.push(rowText);
    }

    sheets.push(sheetLines.join("\n"));
  }

  return sheets.join("\n");
}
