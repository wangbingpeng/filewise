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
  return NextResponse.json(doc);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  ensureDbInitialized();
  const { docId } = await params;
  const [doc] = await db
    .select()
    .from(generatedDocuments)
    .where(eq(generatedDocuments.id, docId));

  if (doc?.filePath && fs.existsSync(doc.filePath)) {
    fs.unlinkSync(doc.filePath);
  }

  await db.delete(generatedDocuments).where(eq(generatedDocuments.id, docId));
  return NextResponse.json({ success: true });
}
