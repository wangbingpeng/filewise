import fs from "fs";
import type { ExtractionResult } from "../extractor";

export async function extractPdf(filePath: string): Promise<ExtractionResult> {
  // pdf-parse has different export formats depending on bundler
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParseModule = require("pdf-parse");

  // Handle different module formats
  let pdfParse: ((buffer: Buffer) => Promise<{
    text: string;
    numpages: number;
    info?: Record<string, unknown>;
  }>) | null = null;

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

  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);

  return {
    text: data.text || "",
    metadata: {
      pages: data.numpages,
      info: data.info,
    },
  };
}
