import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { files, fileContents, classifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  ensureDbInitialized();
  const { fileId } = await params;

  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const [content] = await db.select().from(fileContents).where(eq(fileContents.fileId, fileId));
  const [classification] = await db.select().from(classifications).where(eq(classifications.fileId, fileId));

  return NextResponse.json({
    ...file,
    content: content || null,
    classification: classification || null,
  });
}
