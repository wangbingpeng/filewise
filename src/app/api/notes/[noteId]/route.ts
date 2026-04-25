import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { notes, noteTagRelations, noteTags, noteFolders, knowledgeEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { softDeleteNoteFile, saveNoteToFile } from "@/lib/notes/file-sync";
import { sqlite } from "@/lib/db";
import { generateEmbedding, serializeEmbedding } from "@/lib/ai/embeddings";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  ensureDbInitialized();
  const { noteId } = await params;
  const [note] = await db.select().from(notes).where(eq(notes.id, noteId));
  if (!note) {
    return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  }

  const tags = await db
    .select({ id: noteTags.id, name: noteTags.name, color: noteTags.color })
    .from(noteTagRelations)
    .innerJoin(noteTags, eq(noteTagRelations.tagId, noteTags.id))
    .where(eq(noteTagRelations.noteId, noteId));

  return NextResponse.json({ ...note, tags });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ noteId: string }> }
) {
  ensureDbInitialized();
  const { noteId } = await params;
  const body = await request.json();
  const now = Date.now();

  // Validate title if provided
  if (body.title !== undefined) {
    const title = body.title as string;
    if (!title.trim()) {
      return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
    }
    if (title.length > 100) {
      return NextResponse.json({ error: "标题不能超过100个字符" }, { status: 400 });
    }
    if (/[\\/:*?"<>|]/.test(title)) {
      return NextResponse.json({ error: "标题不能包含以下字符: \\ / : * ? \" < > |" }, { status: 400 });
    }
  }

  const updateData: Record<string, unknown> = { updatedAt: now };
  if (body.title !== undefined) updateData.title = body.title;
  if (body.content !== undefined) {
    updateData.content = body.content;
    updateData.excerpt = body.content.slice(0, 200);
    updateData.wordCount = body.content.length;
  }
  if (body.folderId !== undefined) updateData.folderId = body.folderId;
  if (body.isPinned !== undefined) updateData.isPinned = body.isPinned ? 1 : 0;

  await db.update(notes).set(updateData).where(eq(notes.id, noteId));
  
  // 重新查询获取最新数据 (用于后续的知识条目和文件同步)
  const [updatedNote] = await db.select().from(notes).where(eq(notes.id, noteId));
    
  if (!updatedNote) {
    return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  }
  
  // 更新知识条目（用于搜索）
  try {
    const knowledgeId = `note_${noteId}`;
      
    // 生成新的 embedding
    let embedding: Buffer | null = null;
    try {
      const embeddingArray = await generateEmbedding(updatedNote.content.slice(0, 2000));
      embedding = serializeEmbedding(embeddingArray);
    } catch (embedError) {
      console.error("Failed to generate embedding for note update:", embedError);
    }
      
    // 更新或创建知识条目
    const existingEntry = await db.select().from(knowledgeEntries)
      .where(eq(knowledgeEntries.id, knowledgeId)).get();
      
    if (existingEntry) {
      // 更新现有条目
      await db.update(knowledgeEntries)
        .set({
          title: updatedNote.title,
          content: updatedNote.content,
          embedding,
        })
        .where(eq(knowledgeEntries.id, knowledgeId));
        
      // 更新 FTS 索引
      try {
        sqlite.exec(
          `UPDATE knowledge_fts SET 
            title = '${updatedNote.title.replace(/'/g, "''")}',
            content = '${updatedNote.content.replace(/'/g, "''")}'
          WHERE rowid = (SELECT rowid FROM knowledge_entries WHERE id = '${knowledgeId}')`
        );
      } catch (ftsError) {
        console.error("Failed to update FTS index for note:", ftsError);
      }
    } else {
      // 创建新条目（兼容旧笔记）
      await db.insert(knowledgeEntries).values({
        id: knowledgeId,
        noteId: noteId,
        sourceType: "note",
        chunkIndex: 0,
        title: updatedNote.title,
        content: updatedNote.content,
        embedding,
        createdAt: updatedNote.createdAt,
      });
        
      // 插入 FTS 索引
      try {
        sqlite.exec(
          `INSERT INTO knowledge_fts(rowid, title, content) VALUES (
            (SELECT rowid FROM knowledge_entries WHERE id = '${knowledgeId}'),
            '${updatedNote.title.replace(/'/g, "''")}',
            '${updatedNote.content.replace(/'/g, "''")}'
          )`
        );
      } catch (ftsError) {
        console.error("Failed to insert FTS index for note:", ftsError);
      }
    }
  } catch (knowledgeError) {
    console.error("Failed to update knowledge entry for note:", knowledgeError);
    // 不影响笔记更新，继续执行
  }
  
  // Update tags if provided
  if (body.tagIds && Array.isArray(body.tagIds)) {
    await db.delete(noteTagRelations).where(eq(noteTagRelations.noteId, noteId));
    for (const tagId of body.tagIds) {
      await db.insert(noteTagRelations).values({ noteId, tagId });
    }
  }
  
  // Sync to Markdown file - 使用更新后的数据
  try {
    // Fetch tags for file sync
    const tags = await db
      .select({ name: noteTags.name, color: noteTags.color })
      .from(noteTagRelations)
      .innerJoin(noteTags, eq(noteTagRelations.tagId, noteTags.id))
      .where(eq(noteTagRelations.noteId, noteId));
      
    // Fetch all folders
    const allFolders = await db.select().from(noteFolders);
  
    saveNoteToFile({
      id: updatedNote.id,
      title: updatedNote.title,
      content: updatedNote.content,
      createdAt: updatedNote.createdAt,
      updatedAt: updatedNote.updatedAt,
      folderId: updatedNote.folderId,
      tags,
      allFolders,
    });
    console.log(`Note file synced: ${updatedNote.title} (${updatedNote.id})`);
  } catch (error) {
    console.error("Failed to sync note to file:", error);
    // Don't fail the request if file sync fails
  }
  
  return NextResponse.json(updatedNote);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  ensureDbInitialized();
  const { noteId } = await params;
  
  // Get note info before deletion
  const [note] = await db.select().from(notes).where(eq(notes.id, noteId));
  
  // 删除知识条目和 FTS 索引
  try {
    const knowledgeId = `note_${noteId}`;
    
    // 删除 FTS 索引
    try {
      sqlite.exec(
        `DELETE FROM knowledge_fts WHERE rowid = (SELECT rowid FROM knowledge_entries WHERE id = '${knowledgeId}')`
      );
    } catch (ftsError) {
      console.error("Failed to delete FTS index for note:", ftsError);
    }
    
    // 删除知识条目
    await db.delete(knowledgeEntries).where(eq(knowledgeEntries.id, knowledgeId));
  } catch (knowledgeError) {
    console.error("Failed to delete knowledge entry for note:", knowledgeError);
    // 不影响笔记删除，继续执行
  }
  
  // Soft delete note file on filesystem (rename with timestamp)
  let deletedPath: string | null = null;
  if (note) {
    try {
      const allFolders = await db.select().from(noteFolders);
      deletedPath = softDeleteNoteFile(noteId, note.title, note.folderId, allFolders);
    } catch (error) {
      console.error("Failed to soft delete note file:", error);
      // Don't fail the request if file soft deletion fails
    }
  }
  
  // Delete from database
  await db.delete(noteTagRelations).where(eq(noteTagRelations.noteId, noteId));
  await db.delete(notes).where(eq(notes.id, noteId));

  return NextResponse.json({ 
    success: true,
    deletedPath: deletedPath,
    message: "笔记已软删除,文件已保留并标记为删除状态"
  });
}
