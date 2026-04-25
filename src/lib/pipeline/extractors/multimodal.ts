import fs from "fs";
import JSZip from "jszip";
import { getAIClient, getVisionModelName } from "@/lib/ai/client";

// Constants
export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB - skip processing
export const SLICE_FILE_SIZE = 10 * 1024 * 1024; // 10MB - slice for multimodal
export const EXTRACT_TIMEOUT = 30 * 1000; // 30 seconds

// Image limits for multimodal
const MAX_PAGES_NO_SLICE = 10;
const MAX_PAGES_SLICED = 5; // When file > 10MB, process fewer pages

export interface MultimodalResult {
  text: string;
  metadata?: Record<string, unknown>;
}

/**
 * Check if file should be processed (size limit)
 */
export function shouldProcessFile(filePath: string): {
  ok: boolean;
  reason?: string;
  needSlice?: boolean;
} {
  const stats = fs.statSync(filePath);
  const sizeMB = stats.size / 1024 / 1024;

  if (stats.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      reason: `文件过大 (${sizeMB.toFixed(1)}MB)，超过500MB限制`,
    };
  }

  return {
    ok: true,
    needSlice: stats.size > SLICE_FILE_SIZE,
  };
}

/**
 * Wrap extraction with timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = EXTRACT_TIMEOUT
): Promise<{ result?: T; timeout: boolean; error?: Error }> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<{ timeout: boolean }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ timeout: true }), timeoutMs);
  });

  const resultPromise = promise
    .then((r) => ({ result: r, timeout: false }))
    .catch((e) => ({ timeout: false, error: e }));

  const race = await Promise.race([resultPromise, timeoutPromise]);
  clearTimeout(timeoutId!);

  return race;
}

/**
 * Convert PDF to images (base64)
 * Uses dynamic import to avoid build-time issues with native modules
 */
async function pdfToImages(
  filePath: string,
  needSlice: boolean
): Promise<{ images: string[]; totalPages: number }> {
  const maxPages = needSlice ? MAX_PAGES_SLICED : MAX_PAGES_NO_SLICE;
  const images: string[] = [];
  let totalPages = 0;

  // Dynamic import to avoid bundling native modules during build
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { pdf: pdf2img } = require("pdf-to-img");

  const pages = await pdf2img(filePath, { scale: 2 });

  for await (const page of pages) {
    totalPages++;
    if (images.length < maxPages) {
      const base64 = page.toString("base64");
      images.push(`data:image/png;base64,${base64}`);
    }
  }

  return { images, totalPages };
}

/**
 * Convert PPTX to images
 * Uses embedded thumbnails if available
 */
async function pptxToImages(
  filePath: string
): Promise<{ images: string[]; totalPages: number }> {
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const images: string[] = [];
  let totalPages = 0;

  // Count slides
  let slideIndex = 1;
  while (zip.file(`ppt/slides/slide${slideIndex}.xml`)) {
    totalPages++;
    slideIndex++;
  }

  // Get embedded thumbnail
  const thumbnail = zip.file("docProps/thumbnail.jpeg");
  if (thumbnail) {
    const thumbData = await thumbnail.async("base64");
    images.push(`data:image/jpeg;base64,${thumbData}`);
  }

  return { images, totalPages };
}

/**
 * Convert DOCX to images
 * Uses embedded thumbnail if available
 */
async function docxToImages(): Promise<{ images: string[]; totalPages: number }> {
  // DOCX usually doesn't have thumbnails, return empty
  // In production, would need to convert to PDF first or use a rendering service
  return { images: [], totalPages: 1 };
}

/**
 * Call vision model to extract content from images
 */
async function extractFromImages(
  images: string[],
  extension: string,
  context?: {
    totalPages?: number;
    processedPages?: number;
    needSlice?: boolean;
  }
): Promise<string> {
  if (images.length === 0) {
    throw new Error("无法生成文档图片，请检查文件是否损坏");
  }

  const client = getAIClient();

  let promptText = `这是一份${extension.toUpperCase()}文档的页面图片。请提取所有文字内容，保持原有结构和层级关系。

要求：
1. 识别并保留标题层级（一级标题、二级标题等）
2. 识别列表和表格，用Markdown格式表示
3. 如果有图表，描述图表内容
4. 不要添加任何解释，直接输出提取的内容`;

  // Add context for sliced files
  if (context?.needSlice && context.totalPages) {
    promptText += `\n\n注意：文档共${context.totalPages}页，由于文件较大，仅处理前${context.processedPages || images.length}页作为摘要。`;
  }

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: promptText }];

  // Add images
  for (const img of images) {
    content.push({
      type: "image_url",
      image_url: { url: img },
    });
  }

  // Use configured vision model
  const visionModel = getVisionModelName();

  const response = await client.chat.completions.create({
    model: visionModel,
    messages: [{ role: "user", content }],
    max_tokens: 4000,
  });

  return response.choices[0]?.message?.content || "";
}

/**
 * Main multimodal extraction function
 * Used as fallback when text extraction fails or times out
 */
export async function extractWithMultimodal(
  filePath: string,
  extension: string,
  needSlice: boolean = false
): Promise<MultimodalResult> {
  const ext = extension.toLowerCase().replace(/^\./, "");

  let imageData: { images: string[]; totalPages: number };

  try {
    switch (ext) {
      case "pdf":
        imageData = await pdfToImages(filePath, needSlice);
        break;
      case "pptx":
      case "ppt":
        imageData = await pptxToImages(filePath);
        break;
      case "docx":
      case "doc":
        imageData = await docxToImages();
        break;
      default:
        throw new Error(`多模态不支持文件类型: ${ext}`);
    }

    const text = await extractFromImages(imageData.images, ext, {
      totalPages: imageData.totalPages,
      processedPages: imageData.images.length,
      needSlice,
    });

    return {
      text,
      metadata: {
        method: "multimodal",
        imageCount: imageData.images.length,
        totalPages: imageData.totalPages,
        sliced: needSlice,
        extension: ext,
      },
    };
  } catch (error) {
    throw new Error(`多模态解析失败: ${(error as Error).message}`);
  }
}
