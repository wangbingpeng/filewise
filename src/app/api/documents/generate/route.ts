import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { generatedDocuments, knowledgeEntries, files } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { chatCompletion } from "@/lib/ai/client";
import { DOC_GENERATION_PROMPTS } from "@/lib/ai/prompts";
import { renderPptx } from "@/lib/doc-renderers/pptx-renderer";
import { renderDocx } from "@/lib/doc-renderers/docx-renderer";
import fs from "fs";
import path from "path";

export async function POST(request: Request) {
  ensureDbInitialized();
  const body = await request.json();
  const { title, format, docType, sourceFileIds, prompt: userPrompt } = body;

  if (!title || !format || !docType) {
    return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
  }

  const id = nanoid();
  const now = Date.now();

  // Create record in generating state
  await db.insert(generatedDocuments).values({
    id,
    title,
    format,
    docType,
    sourceFileIds: JSON.stringify(sourceFileIds || []),
    status: "generating",
    createdAt: now,
  });

  // Run generation in background
  generateDocument(id, { title, format, docType, sourceFileIds: sourceFileIds || [], userPrompt }).catch(
    async (err) => {
      await db
        .update(generatedDocuments)
        .set({ status: "failed", error: String(err) })
        .where(eq(generatedDocuments.id, id));
    }
  );

  const [doc] = await db
    .select()
    .from(generatedDocuments)
    .where(eq(generatedDocuments.id, id));
  return NextResponse.json(doc, { status: 201 });
}

async function generateDocument(
  docId: string,
  opts: {
    title: string;
    format: string;
    docType: string;
    sourceFileIds: string[];
    userPrompt?: string;
  }
) {
  // 1. Gather source content
  let sourceContent = "";

  if (opts.sourceFileIds.length > 0) {
    const entries = await db
      .select()
      .from(knowledgeEntries)
      .where(inArray(knowledgeEntries.fileId, opts.sourceFileIds));

    if (entries.length > 0) {
      sourceContent = entries.map((e) => e.content).join("\n\n---\n\n");
    } else {
      // Fallback: get file names
      const fileRecords = await db
        .select()
        .from(files)
        .where(inArray(files.id, opts.sourceFileIds));
      sourceContent = fileRecords.map((f) => `文件: ${f.fileName}`).join("\n");
    }
  }

  // 2. Generate Markdown content via AI
  const systemPrompt =
    DOC_GENERATION_PROMPTS[opts.docType as keyof typeof DOC_GENERATION_PROMPTS] ||
    DOC_GENERATION_PROMPTS.report;

  const userMessage = `${opts.userPrompt ? `用户要求: ${opts.userPrompt}\n\n` : ""}标题: ${opts.title}\n\n参考材料:\n${sourceContent || "无参考材料，请根据标题生成内容"}`;

  const content = await chatCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    { temperature: 0.7, maxTokens: 4000 }
  );

  // 3. Render to target format
  const outputDir = path.join(process.cwd(), "data", "generated");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let filePath: string | null = null;
  let fileSize: number | null = null;

  if (opts.format === "pptx") {
    filePath = path.join(outputDir, `${docId}.pptx`);
    await renderPptx(content, filePath, opts.title);
    fileSize = fs.statSync(filePath).size;
  } else if (opts.format === "docx") {
    filePath = path.join(outputDir, `${docId}.docx`);
    await renderDocx(content, filePath, opts.title);
    fileSize = fs.statSync(filePath).size;
  }
  // markdown format: content is stored directly

  // 4. Update record
  await db
    .update(generatedDocuments)
    .set({
      content,
      filePath,
      fileSize,
      status: "ready",
    })
    .where(eq(generatedDocuments.id, docId));
}
