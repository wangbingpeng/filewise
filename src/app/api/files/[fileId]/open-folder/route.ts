import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { files, folders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  ensureDbInitialized();
  const { fileId } = await params;

  // Get file info
  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  // Get folder info
  const [folder] = await db.select().from(folders).where(eq(folders.id, file.folderId));
  if (!folder) {
    return NextResponse.json({ error: "文件夹不存在" }, { status: 404 });
  }

  // Check if it's a browser-uploaded folder (no local path)
  if (folder.path.startsWith("/浏览器上传/") || folder.path.includes("data/uploads/")) {
    return NextResponse.json({ error: "浏览器上传的文件无法在本地打开" }, { status: 400 });
  }

  // Build full file path
  const fullPath = path.join(folder.path, file.relativePath);
  
  // Get the directory containing the file
  const dirPath = path.dirname(fullPath);

  try {
    // Detect OS and open folder
    const platform = process.platform;
    
    if (platform === "darwin") {
      // macOS: open folder and select file
      await execAsync(`open -R "${fullPath}"`);
    } else if (platform === "win32") {
      // Windows: open folder and select file
      await execAsync(`explorer /select,"${fullPath.replace(/\//g, "\\\\")}"`);
    } else {
      // Linux: just open the folder
      await execAsync(`xdg-open "${dirPath}"`);
    }

    return NextResponse.json({ success: true, path: dirPath });
  } catch (error) {
    console.error("Failed to open folder:", error);
    return NextResponse.json({ 
      error: "无法打开文件夹", 
      details: String(error) 
    }, { status: 500 });
  }
}
