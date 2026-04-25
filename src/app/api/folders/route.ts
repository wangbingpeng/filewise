import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { folders } from "@/lib/db/schema";
import { eq, desc, like, or } from "drizzle-orm";
import { nanoid } from "nanoid";

// 获取所有文件夹
export async function GET(request: NextRequest) {
  ensureDbInitialized();
  
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q");

  // 如果有搜索参数，执行搜索
  if (q) {
    const results = await db
      .select()
      .from(folders)
      .where(
        or(
          like(folders.name, `%${q}%`),
          like(folders.path, `%${q}%`)
        )
      )
      .orderBy(folders.createdAt);
    
    return NextResponse.json(results);
  }

  // 否则返回所有文件夹
  const allFolders = await db.select().from(folders).orderBy(desc(folders.createdAt));
  return NextResponse.json(allFolders);
}

// 添加文件夹
export async function POST(request: Request) {
  ensureDbInitialized();
  const body = await request.json();
  const { path: folderPath, name } = body;

  if (!folderPath) {
    return NextResponse.json({ error: "路径不能为空" }, { status: 400 });
  }

  const folderName = name || folderPath.split("/").filter(Boolean).pop() || "未命名";

  // Dedup: check if a folder with the same name already exists
  const existing = await db.select().from(folders).where(eq(folders.name, folderName));
  if (existing.length > 0) {
    // Return the one with the most files (prefer the most useful one)
    const best = existing.sort((a, b) => b.fileCount - a.fileCount)[0];
    return NextResponse.json(best, { status: 200 });
  }

  const now = Date.now();
  const id = nanoid();

  await db.insert(folders).values({
    id,
    name: folderName,
    path: folderPath,
    fileCount: 0,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  const [folder] = await db.select().from(folders).where(eq(folders.id, id));
  return NextResponse.json(folder, { status: 201 });
}
