/**
 * FILE EXTRACTOR - READ-ONLY ACCESS TO SOURCE FILES
 *
 * All extractors in this module only READ source files for content extraction.
 * They NEVER modify, copy, or delete any source files.
 * Extracted content is stored only in the database, not on the file system.
 */

import { extractPdf } from "./extractors/pdf";
import { extractDocx } from "./extractors/docx";
import { extractPptx } from "./extractors/pptx";
import { extractMarkdown } from "./extractors/markdown";
import { extractText, extractHtml, extractXml } from "./extractors/text";
import { extractXlsx } from "./extractors/xlsx";
import { extractCsv } from "./extractors/csv";
import {
  extractWithMultimodal,
  shouldProcessFile,
  withTimeout,
  EXTRACT_TIMEOUT,
} from "./extractors/multimodal";

export interface ExtractionResult {
  text: string;
  language?: string;
  metadata?: Record<string, unknown>;
  method?: "text" | "multimodal";
}

// Text extraction methods (Layer 1)
const textExtractors: Record<
  string,
  (filePath: string) => Promise<ExtractionResult>
> = {
  pdf: extractPdf,
  docx: extractDocx,
  doc: extractDocx,
  pptx: extractPptx,
  ppt: extractPptx,
  xlsx: extractXlsx,
  xls: extractXlsx,
  csv: extractCsv,
  md: extractMarkdown,
  markdown: extractMarkdown,
  txt: extractText,
  html: extractHtml,
  htm: extractHtml,
  xml: extractXml,
};

// File types supported by multimodal (Layer 2 fallback)
const multimodalSupported = new Set([
  "pdf",
  "pptx",
  "ppt",
  "docx",
  "doc",
]);

/**
 * Main extraction function with hybrid layered approach:
 *
 * Layer 1: Text extraction (fast, free)
 *   - Check file size (< 200MB)
 *   - Try text extraction with 30s timeout
 *   - If success, return result
 *
 * Layer 2: Multimodal fallback (AI vision)
 *   - Triggered when:
 *     1. Text extraction times out (>30s)
 *     2. Text extraction fails with error
 *     3. No text extractor available but multimodal supported
 *   - For files >10MB, use slicing (process fewer pages)
 */
export async function extractFileContent(
  filePath: string,
  extension: string
): Promise<ExtractionResult> {
  const ext = extension.toLowerCase().replace(/^\./, "");

  // Step 1: Check file size
  const sizeCheck = shouldProcessFile(filePath);
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.reason!);
  }

  const { needSlice } = sizeCheck;

  // Step 2: Try text extraction (Layer 1)
  const textExtractor = textExtractors[ext];

  if (textExtractor) {
    console.log(`[Extractor] Attempting text extraction for ${ext}: ${filePath}`);

    const { result, timeout, error } = await withTimeout(
      textExtractor(filePath),
      EXTRACT_TIMEOUT
    );

    if (timeout) {
      console.log(
        `[Extractor] Text extraction timeout (>30s), falling back to multimodal for ${filePath}`
      );
      // Fall through to multimodal
    } else if (error) {
      console.log(
        `[Extractor] Text extraction failed: ${error.message}, falling back to multimodal for ${filePath}`
      );
      // Fall through to multimodal
    } else if (result) {
      // Text extraction succeeded
      // Check if result has meaningful content
      if (result.text && result.text.trim().length > 100) {
        console.log(
          `[Extractor] Text extraction success, ${result.text.length} chars`
        );
        return {
          ...result,
          method: "text",
        };
      } else {
        console.log(
          `[Extractor] Text extraction returned insufficient content (${result.text?.length || 0} chars), falling back to multimodal`
        );
        // Fall through to multimodal
      }
    }
  }

  // Step 3: Try multimodal fallback (Layer 2)
  if (multimodalSupported.has(ext)) {
    console.log(
      `[Extractor] Using multimodal extraction for ${ext}${needSlice ? " (sliced mode)" : ""}`
    );

    try {
      const multimodalResult = await extractWithMultimodal(filePath, ext, needSlice);
      return {
        text: multimodalResult.text,
        metadata: multimodalResult.metadata,
        method: "multimodal",
      };
    } catch (multimodalError) {
      throw new Error(
        `多模态解析失败: ${(multimodalError as Error).message}`
      );
    }
  }

  // No extraction method available
  throw new Error(
    `不支持的文件类型: ${ext}（无文本提取器且不支持多模态）`
  );
}

/**
 * Get all supported extensions
 */
export function getSupportedExtensions(): string[] {
  const all = new Set([
    ...Object.keys(textExtractors),
    ...Array.from(multimodalSupported),
  ]);
  return Array.from(all);
}
