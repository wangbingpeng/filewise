import fs from "fs";
import JSZip from "jszip";
import type { ExtractionResult } from "../extractor";

/**
 * Extract text from PPTX files.
 * PPTX files are ZIP archives containing XML files.
 * Text content is in ppt/slides/slide*.xml files.
 */
export async function extractPptx(filePath: string): Promise<ExtractionResult> {
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const slides: string[] = [];
  let slideIndex = 1;

  // Iterate through all slide files
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

  // Also check for notes slides
  let notesIndex = 1;
  const notes: string[] = [];
  while (true) {
    const notesFile = zip.file(`ppt/notesSlides/notesSlide${notesIndex}.xml`);
    if (!notesFile) break;

    const content = await notesFile.async("text");
    const text = extractTextFromXml(content);
    if (text.trim()) {
      notes.push(text);
    }
    notesIndex++;
  }

  let fullText = slides.join("\n\n");
  if (notes.length > 0) {
    fullText += "\n\n--- Notes ---\n" + notes.join("\n");
  }

  return {
    text: fullText,
    metadata: {
      slideCount: slideIndex - 1,
      notesCount: notes.length,
    },
  };
}

/**
 * Extract text content from PowerPoint XML.
 * Text is inside <a:t> tags within the drawing ML namespace.
 */
function extractTextFromXml(xml: string): string {
  // Match text content inside <a:t> tags (drawing ML text)
  // This handles both namespace-prefixed and non-prefixed versions
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
