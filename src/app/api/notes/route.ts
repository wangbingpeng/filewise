import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { notes, noteTagRelations, noteTags, noteFolders, knowledgeEntries } from "@/lib/db/schema";
import { eq, desc, and, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import { saveNoteToFile } from "@/lib/notes/file-sync";
import { sqlite } from "@/lib/db";
import { generateEmbedding, serializeEmbedding } from "@/lib/ai/embeddings";

export async function GET(request: NextRequest) {
  ensureDbInitialized();
  const params = request.nextUrl.searchParams;
  const folderId = params.get("folderId");
  const q = params.get("q");
  const tagId = params.get("tagId");

  let allNotes;

  if (tagId) {
    // Filter by tag
    const relations = await db
      .select({ noteId: noteTagRelations.noteId })
      .from(noteTagRelations)
      .where(eq(noteTagRelations.tagId, tagId));
    const noteIds = relations.map((r) => r.noteId);
    if (noteIds.length === 0) return NextResponse.json([]);

    allNotes = await db.select().from(notes).orderBy(desc(notes.updatedAt));
    allNotes = allNotes.filter((n) => noteIds.includes(n.id));
  } else {
    const conditions = [];
    if (folderId) conditions.push(eq(notes.folderId, folderId));
    if (q) conditions.push(like(notes.title, `%${q}%`));

    allNotes = await db
      .select()
      .from(notes)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(notes.isPinned), desc(notes.updatedAt));
  }

  // Attach tags to each note
  const enriched = await Promise.all(
    allNotes.map(async (note) => {
      const tags = await db
        .select({ id: noteTags.id, name: noteTags.name, color: noteTags.color })
        .from(noteTagRelations)
        .innerJoin(noteTags, eq(noteTagRelations.tagId, noteTags.id))
        .where(eq(noteTagRelations.noteId, note.id));
      return { ...note, tags };
    })
  );

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  ensureDbInitialized();
  const body = await request.json();
  const now = Date.now();
  const id = nanoid();

  // Validate title
  const title = body.title || "无标题笔记";
  if (title.length > 100) {
    return NextResponse.json({ error: "标题不能超过100个字符" }, { status: 400 });
  }
  if (/[\\/:*?"<>|]/.test(title)) {
    return NextResponse.json({ error: "标题不能包含以下字符: \\ / : * ? \" < > |" }, { status: 400 });
  }

  await db.insert(notes).values({
    id,
    title,
    content: body.content || "",
    excerpt: (body.content || "").slice(0, 200),
    folderId: body.folderId || null,
    wordCount: (body.content || "").length,
    createdAt: now,
    updatedAt: now,
  });

  // Handle tags
  let tags: Array<{ name: string; color?: string | null }> = [];
  if (body.tagIds && Array.isArray(body.tagIds)) {
    for (const tagId of body.tagIds) {
      await db.insert(noteTagRelations).values({ noteId: id, tagId });
    }
    // Fetch tag details for file sync
    tags = await db
      .select({ name: noteTags.name, color: noteTags.color })
      .from(noteTagRelations)
      .innerJoin(noteTags, eq(noteTagRelations.tagId, noteTags.id))
      .where(eq(noteTagRelations.noteId, id));
  }

  const [note] = await db.select().from(notes).where(eq(notes.id, id));

  // 创建知识条目（用于搜索）
  try {
    const knowledgeId = `note_${id}`;
    
    // 生成 embedding（向量）
    let embedding: Buffer | null = null;
    try {
      const embeddingArray = await generateEmbedding(note.content.slice(0, 2000)); // 限制长度
      embedding = serializeEmbedding(embeddingArray);
    } catch (embedError) {
      console.error("Failed to generate embedding for note:", embedError);
    }
    
    await db.insert(knowledgeEntries).values({
      id: knowledgeId,
      noteId: id,
      sourceType: "note",
      chunkIndex: 0,
      title: note.title,
      content: note.content,
      embedding,
      createdAt: now,
    });

    // 更新 FTS 索引
    try {
      sqlite.exec(
        `INSERT INTO knowledge_fts(rowid, title, content) VALUES (
          (SELECT rowid FROM knowledge_entries WHERE id = '${knowledgeId}'),
          '${note.title.replace(/'/g, "''")}',
          '${note.content.replace(/'/g, "''")}'
        )`
      );
    } catch (ftsError) {
      console.error("Failed to update FTS index for note:", ftsError);
    }
  } catch (knowledgeError) {
    console.error("Failed to create knowledge entry for note:", knowledgeError);
    // 不影响笔记创建，继续执行
  }

  // Sync to Markdown file
  try {
    const allFolders = await db.select().from(noteFolders);
    saveNoteToFile({
      id: note.id,
      title: note.title,
      content: note.content,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      folderId: note.folderId,
      tags,
      allFolders,
    });
  } catch (error) {
    console.error("Failed to save note to file:", error);
    // Don't fail the request if file sync fails
  }

  return NextResponse.json(note, { status: 201 });
}
