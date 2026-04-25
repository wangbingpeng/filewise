import fs from "fs";
import mammoth from "mammoth";
import type { ExtractionResult } from "../extractor";

export async function extractDocx(filePath: string): Promise<ExtractionResult> {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  
  return {
    text: result.value || "",
    metadata: {
      messages: result.messages,
    },
  };
}
