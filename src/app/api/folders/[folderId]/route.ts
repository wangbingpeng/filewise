import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { folders, files } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ folderId: string }> }
) {
  ensureDbInitialized();
  const { folderId } = await params;

  const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
  if (!folder) {
    return NextResponse.json({ error: "文件夹不存在" }, { status: 404 });
  }

  const folderFiles = await db.select().from(files).where(eq(files.folderId, folderId));

  return NextResponse.json({ ...folder, files: folderFiles });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ folderId: string }> }
) {
  ensureDbInitialized();
  const { folderId } = await params;

  // Delete from database only (cascade will handle files and file_contents)
  // IMPORTANT: Never delete source files from disk - read-only access
  await db.delete(folders).where(eq(folders.id, folderId));

  return NextResponse.json({ success: true });
}
