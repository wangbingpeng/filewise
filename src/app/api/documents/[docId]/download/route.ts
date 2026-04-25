import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { generatedDocuments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  ensureDbInitialized();
  const { docId } = await params;
  const [doc] = await db
    .select()
    .from(generatedDocuments)
    .where(eq(generatedDocuments.id, docId));

  if (!doc) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }

  if (doc.format === "markdown") {
    return new Response(doc.content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.title)}.md"`,
      },
    });
  }

  if (!doc.filePath || !fs.existsSync(doc.filePath)) {
    return NextResponse.json({ error: "文件未找到" }, { status: 404 });
  }

  const buffer = fs.readFileSync(doc.filePath);
  const mimeMap: Record<string, string> = {
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };

  return new Response(buffer, {
    headers: {
      "Content-Type": mimeMap[doc.format] || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.title)}.${doc.format}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
