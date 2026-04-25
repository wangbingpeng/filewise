import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { noteFolders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { softDeleteNoteFolder } from "@/lib/notes/file-sync";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ folderId: string }> }
) {
  ensureDbInitialized();
  const { folderId } = await params;
  const body = await request.json();

  // Get folder info before update
  const [oldFolder] = await db.select().from(noteFolders).where(eq(noteFolders.id, folderId));
  
  if (!oldFolder) {
    return NextResponse.json({ error: "文件夹不存在" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.parentId !== undefined) updateData.parentId = body.parentId;
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;

  // Update database
  await db.update(noteFolders).set(updateData).where(eq(noteFolders.id, folderId));

  // Get updated folder info
  const [newFolder] = await db.select().from(noteFolders).where(eq(noteFolders.id, folderId));
  
  // Sync to filesystem if name or parentId changed
  if (body.name !== undefined || body.parentId !== undefined) {
    try {
      const allFolders = await db.select().from(noteFolders);
      
      // Import renameNoteFolder dynamically to avoid unused import error
      const { renameNoteFolder } = await import("@/lib/notes/file-sync");
      
      // If name changed, rename the folder
      if (body.name !== undefined && body.name !== oldFolder.name) {
        renameNoteFolder(
          folderId,
          oldFolder.name,
          newFolder.name,
          newFolder.parentId,
          allFolders
        );
      }
      // If parentId changed, need to move the folder
      else if (body.parentId !== undefined && body.parentId !== oldFolder.parentId) {
        const allFoldersForMove = await db.select().from(noteFolders);
        renameNoteFolder(
          folderId,
          oldFolder.name,
          newFolder.name,
          newFolder.parentId,
          allFoldersForMove
        );
      }
    } catch (error) {
      console.error("Failed to sync folder to filesystem:", error);
      // Don't fail the request if filesystem sync fails
    }
  }

  return NextResponse.json(newFolder);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ folderId: string }> }
) {
  ensureDbInitialized();
  const { folderId } = await params;
  
  // Get folder info BEFORE deletion
  const [folder] = await db.select().from(noteFolders).where(eq(noteFolders.id, folderId));
  
  if (!folder) {
    return NextResponse.json({ error: "文件夹不存在" }, { status: 404 });
  }
  
  // Get all folders BEFORE deletion (needed for path building)
  const allFolders = await db.select().from(noteFolders);
  
  // Soft delete folder on filesystem (rename with timestamp)
  let deletedPath: string | null = null;
  try {
    deletedPath = softDeleteNoteFolder(
      folder.id,
      folder.name,
      folder.parentId,
      allFolders  // Use the folder list BEFORE deletion
    );
  } catch (error) {
    console.error("Failed to soft delete folder from filesystem:", error);
    // Don't fail the request if filesystem soft delete fails
  }
  
  // Delete from database
  await db.delete(noteFolders).where(eq(noteFolders.id, folderId));
  
  return NextResponse.json({ 
    success: true,
    deletedPath: deletedPath,
    message: "文件夹已软删除,文件已保留并标记为删除状态"
  });
}
