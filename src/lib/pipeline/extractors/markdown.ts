import fs from "fs";
import matter from "gray-matter";
import type { ExtractionResult } from "../extractor";

export async function extractMarkdown(filePath: string): Promise<ExtractionResult> {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { content, data: frontmatter } = matter(raw);

  // Strip markdown syntax for plain text
  const plainText = content
    .replace(/^#{1,6}\s+/gm, "")     // headings
    .replace(/\*\*(.+?)\*\*/g, "$1")  // bold
    .replace(/\*(.+?)\*/g, "$1")      // italic
    .replace(/`{1,3}[^`]*`{1,3}/g, "") // code
    .replace(/\[(.+?)\]\(.+?\)/g, "$1") // links
    .replace(/!\[.*?\]\(.+?\)/g, "")   // images
    .replace(/^[-*+]\s+/gm, "")       // list items
    .replace(/^\d+\.\s+/gm, "")       // numbered list
    .replace(/^>\s+/gm, "")           // blockquotes
    .replace(/---+/g, "")             // horizontal rules
    .trim();

  return {
    text: plainText,
    metadata: {
      frontmatter,
      rawMarkdown: content,
    },
  };
}
