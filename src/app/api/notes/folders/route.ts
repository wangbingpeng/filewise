import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { noteFolders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createNoteFolder } from "@/lib/notes/file-sync";

export async function GET() {
  ensureDbInitialized();
  const all = await db.select().from(noteFolders).orderBy(noteFolders.sortOrder);
  return NextResponse.json(all);
}

export async function POST(request: Request) {
  ensureDbInitialized();
  const body = await request.json();
  const id = nanoid();
  const now = Date.now();

  await db.insert(noteFolders).values({
    id,
    name: body.name || "新文件夹",
    parentId: body.parentId || null,
    sortOrder: body.sortOrder || 0,
    createdAt: now,
  });

  const [folder] = await db.select().from(noteFolders).where(eq(noteFolders.id, id));
  
  // Create folder on filesystem
  try {
    const allFolders = await db.select().from(noteFolders);
    createNoteFolder(
      folder.id,
      folder.name,
      folder.parentId,
      allFolders
    );
  } catch (error) {
    console.error("Failed to create note folder on filesystem:", error);
    // Don't fail the request if folder creation fails
  }
  
  return NextResponse.json(folder, { status: 201 });
}
