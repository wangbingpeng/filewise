import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import fs from "fs";

interface DocSection {
  type: "heading1" | "heading2" | "heading3" | "paragraph" | "bullet";
  text: string;
}

function parseMarkdownToSections(markdown: string): DocSection[] {
  const sections: DocSection[] = [];
  const lines = markdown.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("### ")) {
      sections.push({ type: "heading3", text: trimmed.replace(/^###\s+/, "") });
    } else if (trimmed.startsWith("## ")) {
      sections.push({ type: "heading2", text: trimmed.replace(/^##\s+/, "") });
    } else if (trimmed.startsWith("# ")) {
      sections.push({ type: "heading1", text: trimmed.replace(/^#\s+/, "") });
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || /^\d+\.\s/.test(trimmed)) {
      const text = trimmed.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
      sections.push({ type: "bullet", text });
    } else {
      // Strip bold/italic markdown markers
      const plainText = trimmed.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1");
      sections.push({ type: "paragraph", text: plainText });
    }
  }

  return sections;
}

export async function renderDocx(
  markdownContent: string,
  outputPath: string,
  docTitle: string
): Promise<void> {
  const sections = parseMarkdownToSections(markdownContent);

  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: docTitle,
          bold: true,
          size: 48, // 24pt
          font: "Microsoft YaHei",
        }),
      ],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // Subtitle
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "由 FileWise 智能生成",
          color: "999999",
          size: 24,
          font: "Microsoft YaHei",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    })
  );

  // Content
  for (const section of sections) {
    switch (section.type) {
      case "heading1":
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: section.text, bold: true, size: 36, font: "Microsoft YaHei" }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          })
        );
        break;
      case "heading2":
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: section.text, bold: true, size: 30, font: "Microsoft YaHei" }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 },
          })
        );
        break;
      case "heading3":
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: section.text, bold: true, size: 26, font: "Microsoft YaHei" }),
            ],
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 },
          })
        );
        break;
      case "bullet":
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: section.text, size: 22, font: "Microsoft YaHei" }),
            ],
            bullet: { level: 0 },
            spacing: { after: 80 },
          })
        );
        break;
      default:
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: section.text, size: 22, font: "Microsoft YaHei" }),
            ],
            spacing: { after: 120 },
          })
        );
    }
  }

  const doc = new Document({
    sections: [{ children }],
    creator: "FileWise",
    title: docTitle,
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}
