import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { folders, files, fileContents } from "@/lib/db/schema";
import { eq, count, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import JSZip from "jszip";

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

        // 使用文件名+文件大小+修改时间作为快速哈希
        const hash = `${entry.name}-${stat.size}-${stat.mtimeMs}`;

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ folderId: string }> }
) {
  ensureDbInitialized();
  const { folderId } = await params;

  const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
  if (!folder) {
    return NextResponse.json({ error: "文件夹不存在" }, { status: 404 });
  }

  // 跳过浏览器上传的文件夹
  if (folder.path.startsWith("/浏览器上传/")) {
    return NextResponse.json({ error: "浏览器上传的文件夹不支持同步" }, { status: 400 });
  }

  // 检查文件夹路径是否存在
  if (!fs.existsSync(folder.path)) {
    return NextResponse.json({ error: "路径不存在" }, { status: 400 });
  }

  try {
    console.log(`[Sync Folder] Starting sync for: ${folder.name}`);
    
    // 扫描当前文件夹
    const currentFiles = scanDirectory(folder.path, "");
    const currentHashes = new Set(currentFiles.map((f) => f.hash));

    // 获取数据库中已有的文件
    const existingFiles = await db
      .select({ id: files.id, contentHash: files.contentHash })
      .from(files)
      .where(eq(files.folderId, folderId));

    const existingHashes = new Set<string>(
      existingFiles.map((f) => f.contentHash).filter(Boolean) as string[]
    );
    const existingIdByHash = new Map<string, string>(
      existingFiles.filter(f => f.contentHash).map((f) => [f.contentHash as string, f.id])
    );

    // 找出新增的文件
    const newFiles = currentFiles.filter((f) => !existingHashes.has(f.hash));
    console.log(`[Sync Folder] New files: ${newFiles.length}`);

    // 找出已删除的文件
    const deletedHashes = [...existingHashes].filter((h) => !currentHashes.has(h));
    const deletedIds = deletedHashes
      .map((h) => existingIdByHash.get(h))
      .filter(Boolean) as string[];
    console.log(`[Sync Folder] Deleted files: ${deletedIds.length}`);

    // 添加新文件到数据库
    const now = Date.now();
    const addedFileIds: string[] = [];
    
    for (const fileInfo of newFiles) {
      const fileId = nanoid();
      await db.insert(files).values({
        id: fileId,
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
      addedFileIds.push(fileId);
    }

    // 删除已移除的文件记录
    if (deletedIds.length > 0) {
      await db.delete(files).where(
        and(
          eq(files.folderId, folderId),
          inArray(files.id, deletedIds)
        )
      );
    }

    // 更新文件夹文件数量
    const [countResult] = await db
      .select({ count: count() })
      .from(files)
      .where(eq(files.folderId, folderId));

    await db
      .update(folders)
      .set({
        fileCount: countResult.count,
        updatedAt: now,
      })
      .where(eq(folders.id, folderId));

    // 自动处理新添加的文件（提取、分类、索引等）
    let processedCount = 0;
    if (addedFileIds.length > 0) {
      console.log(`[Sync Folder] Auto-processing ${addedFileIds.length} new files`);
      
      for (const fileId of addedFileIds) {
        try {
          // 获取文件信息
          const [file] = await db.select().from(files).where(eq(files.id, fileId));
          if (!file) continue;

          // 读取文件并提取内容
          const filePath = path.join(folder.path, file.relativePath);
          const buffer = fs.readFileSync(filePath);
          const text = await extractTextFromBuffer(buffer, file.extension);

          if (text && text.trim().length > 0) {
            // 保存提取的内容
            await db.insert(fileContents).values({
              id: nanoid(),
              fileId,
              rawText: text,
              charCount: text.length,
              extractedAt: Date.now(),
            });

            // 更新状态为已提取
            await db
              .update(files)
              .set({ status: "extracted", updatedAt: Date.now() })
              .where(eq(files.id, fileId));
            
            processedCount++;
          }
        } catch (error) {
          console.error(`[Sync Folder] Failed to process file ${fileId}:`, error);
          // 保持状态为 discovered，稍后可以重试
        }
      }
    }

    console.log(`[Sync Folder] Sync completed: +${newFiles.length} -${deletedIds.length}, processed: ${processedCount}`);

    return NextResponse.json({
      success: true,
      added: newFiles.length,
      removed: deletedIds.length,
      processed: processedCount,
      totalFiles: countResult.count,
    });
  } catch (error) {
    console.error("[Sync Folder] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

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
  return texts.filter((t) => t.trim()).join("\n");
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function extractXlsxFromBuffer(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const sheets: string[] = [];

  const sharedStringsFile = zip.file("xl/sharedStrings.xml");
  const sharedStrings: string[] = [];
  if (sharedStringsFile) {
    const content = await sharedStringsFile.async("text");
    const matches = content.match(/<t[^>]*>([^<]*)<\/t>/g) || [];
    matches.forEach((match) => {
      const text = match.replace(/<t[^>]*>/, "").replace(/<\/t>$/, "");
      sharedStrings.push(decodeXmlEntities(text));
    });
  }

  let sheetIndex = 1;
  while (true) {
    const sheetFile = zip.file(`xl/worksheets/sheet${sheetIndex}.xml`);
    if (!sheetFile) break;

    const content = await sheetFile.async("text");
    const rows = content.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
    const sheetData: string[][] = [];

    for (const row of rows) {
      const cells = row.match(/<c[^>]*>[\s\S]*?<\/c>/g) || [];
      const rowData: string[] = [];
      for (const cell of cells) {
        const vMatch = cell.match(/<v[^>]*>([^<]*)<\/v>/);
        if (vMatch) {
          const v = vMatch[1];
          const tMatch = cell.match(/t="([^"]*)"/);
          if (tMatch && tMatch[1] === "s" && sharedStrings[parseInt(v)]) {
            rowData.push(sharedStrings[parseInt(v)]);
          } else {
            rowData.push(v);
          }
        }
      }
      if (rowData.length > 0) {
        sheetData.push(rowData);
      }
    }

    if (sheetData.length > 0) {
      sheets.push(`Sheet ${sheetIndex}:\n${sheetData.map((r) => r.join("\t")).join("\n")}`);
    }
    sheetIndex++;
  }

  return sheets.join("\n\n");
}
