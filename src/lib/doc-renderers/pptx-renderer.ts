import PptxGenJS from "pptxgenjs";

interface SlideContent {
  title: string;
  bullets: string[];
}

function parseMarkdownToSlides(markdown: string, docTitle: string): SlideContent[] {
  const slides: SlideContent[] = [];
  const lines = markdown.split("\n");

  let currentSlide: SlideContent | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      if (currentSlide) slides.push(currentSlide);
      currentSlide = { title: trimmed.replace(/^##\s+/, ""), bullets: [] };
    } else if (trimmed.startsWith("# ")) {
      if (currentSlide) slides.push(currentSlide);
      currentSlide = { title: trimmed.replace(/^#\s+/, ""), bullets: [] };
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || /^\d+\.\s/.test(trimmed)) {
      const bullet = trimmed.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
      if (currentSlide) {
        currentSlide.bullets.push(bullet);
      }
    } else if (trimmed && currentSlide) {
      currentSlide.bullets.push(trimmed);
    }
  }

  if (currentSlide) slides.push(currentSlide);

  // If no slides parsed, create a single slide
  if (slides.length === 0) {
    slides.push({
      title: docTitle,
      bullets: markdown
        .split("\n")
        .filter((l) => l.trim())
        .slice(0, 8),
    });
  }

  return slides;
}

export async function renderPptx(
  markdownContent: string,
  outputPath: string,
  docTitle: string
): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.title = docTitle;
  pptx.author = "FileWise";
  pptx.layout = "LAYOUT_WIDE";

  const slides = parseMarkdownToSlides(markdownContent, docTitle);

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.addText(docTitle, {
    x: 0.5,
    y: 1.5,
    w: 12,
    h: 2,
    fontSize: 36,
    fontFace: "Microsoft YaHei",
    color: "1a1a2e",
    align: "center",
    bold: true,
  });
  titleSlide.addText("由 FileWise 智能生成", {
    x: 0.5,
    y: 4,
    w: 12,
    h: 1,
    fontSize: 16,
    fontFace: "Microsoft YaHei",
    color: "666666",
    align: "center",
  });

  // Content slides
  for (const slide of slides) {
    const s = pptx.addSlide();
    s.addText(slide.title, {
      x: 0.5,
      y: 0.3,
      w: 12,
      h: 1,
      fontSize: 28,
      fontFace: "Microsoft YaHei",
      color: "1a1a2e",
      bold: true,
    });

    if (slide.bullets.length > 0) {
      const bodyText = slide.bullets.map((b) => ({
        text: b,
        options: {
          fontSize: 18,
          fontFace: "Microsoft YaHei",
          color: "333333" as const,
          bullet: { code: "2022" } as const,
          paraSpaceAfter: 8,
        },
      }));

      s.addText(bodyText, {
        x: 0.8,
        y: 1.5,
        w: 11.4,
        h: 5.5,
        valign: "top",
      });
    }
  }

  const data = await pptx.write({ outputType: "nodebuffer" }) as Buffer;
  const fs = await import("fs");
  fs.writeFileSync(outputPath, data);
}
