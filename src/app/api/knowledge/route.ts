import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { knowledgeEntries, files, notes, folders, fileContents } from "@/lib/db/schema";
import { eq, desc, and, like, or, inArray } from "drizzle-orm";

export async function GET(request: NextRequest) {
  ensureDbInitialized();
  const params = request.nextUrl.searchParams;
  const sourceType = params.get("sourceType"); // file | note
  const fileId = params.get("fileId");
  const noteId = params.get("noteId");
  const q = params.get("q"); // 搜索词
  const page = parseInt(params.get("page") || "1");
  const limit = parseInt(params.get("limit") || "50");
  const offset = (page - 1) * limit;

  const conditions = [];
  if (sourceType) conditions.push(eq(knowledgeEntries.sourceType, sourceType));
  if (fileId) conditions.push(eq(knowledgeEntries.fileId, fileId));
  if (noteId) conditions.push(eq(knowledgeEntries.noteId, noteId));
  
  // 添加全文搜索（同时搜索标题、内容、文件名、文件夹名、file_contents）
  if (q) {
    console.log(`[Knowledge Search] Searching for: ${q}`);
    
    // 先搜索匹配的文件 ID（文件名或路径包含搜索词）
    const matchingFiles = await db
      .select({ id: files.id, fileName: files.fileName })
      .from(files)
      .where(
        or(
          like(files.fileName, `%${q}%`),
          like(files.relativePath, `%${q}%`)
        )
      );
    
    console.log(`[Knowledge Search] Found ${matchingFiles.length} matching files by name/path`);
    
    const matchingFileIds = matchingFiles.map(f => f.id);
    
    // 搜索匹配的文件夹（文件夹名或路径包含搜索词）
    let matchingFolderFileIds: string[] = [];
    const matchingFolders = await db
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .where(
        or(
          like(folders.name, `%${q}%`),
          like(folders.path, `%${q}%`)
        )
      );
    
    console.log(`[Knowledge Search] Found ${matchingFolders.length} matching folders`);
    
    if (matchingFolders.length > 0) {
      const matchingFolderIds = matchingFolders.map(f => f.id);
      const filesInFolders = await db
        .select({ id: files.id })
        .from(files)
        .where(inArray(files.folderId, matchingFolderIds));
      matchingFolderFileIds = filesInFolders.map(f => f.id);
      console.log(`[Knowledge Search] Found ${matchingFolderFileIds.length} files in matching folders`);
    }
    
    // 合并所有匹配的文件 ID
    const allMatchingFileIds = [...new Set([...matchingFileIds, ...matchingFolderFileIds])];
    console.log(`[Knowledge Search] Total matching file IDs: ${allMatchingFileIds.length}`);
    
    // 如果匹配的文件很少，也搜索 file_contents 表（未索引的文件内容）
    if (allMatchingFileIds.length > 0) {
      // 从 file_contents 中搜索内容
      const matchingContents = await db
        .select({ 
          fileId: fileContents.fileId,
          rawText: fileContents.rawText
        })
        .from(fileContents)
        .where(
          and(
            inArray(fileContents.fileId, allMatchingFileIds),
            like(fileContents.rawText, `%${q}%`)
          )
        )
        .limit(50);
      
      console.log(`[Knowledge Search] Found ${matchingContents.length} matching file_contents`);
      
      // 将这些内容转换为 knowledge entry 格式
      if (matchingContents.length > 0) {
        // 获取这些文件的文件名
        const contentFileIds = [...new Set(matchingContents.map(c => c.fileId))];
        const contentFiles = await db
          .select({ id: files.id, fileName: files.fileName })
          .from(files)
          .where(inArray(files.id, contentFileIds));
        
        const fileNameMap = new Map(contentFiles.map(f => [f.id, f.fileName]));
        
        // 添加到结果中（作为额外的搜索结果）
        const contentResults = matchingContents.map((content, index) => ({
          id: `content_${content.fileId}`,
          fileId: content.fileId,
          noteId: null,
          sourceType: "file" as const,
          chunkIndex: 0,
          title: fileNameMap.get(content.fileId) || "未知文件",
          content: content.rawText.slice(0, 500), // 限制长度
          embedding: null,
          metadata: null,
          createdAt: Date.now(),
          sourceName: fileNameMap.get(content.fileId) || "",
          relevanceScore: 80, // 文件名匹配的权重
        }));
        
        console.log(`[Knowledge Search] Returning ${contentResults.length} results from file_contents`);
        // 返回这些结果（跳过正常的 knowledgeEntries 查询）
        return NextResponse.json(contentResults);
      }
    }
    
    // 构建搜索条件：匹配标题/内容 OR 文件在匹配的文件列表中
    const textSearchCondition = or(
      like(knowledgeEntries.title, `%${q}%`),
      like(knowledgeEntries.content, `%${q}%`)
    );
    
    const fileMatchCondition = allMatchingFileIds.length > 0 
      ? inArray(knowledgeEntries.fileId, allMatchingFileIds)
      : undefined;
    
    conditions.push(
      fileMatchCondition 
        ? or(textSearchCondition, fileMatchCondition)
        : textSearchCondition
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const entries = await db
    .select()
    .from(knowledgeEntries)
    .where(where)
    .orderBy(desc(knowledgeEntries.createdAt))
    .limit(limit)
    .offset(offset);

  // Enrich with source names and add relevance score
  const enriched = await Promise.all(
    entries.map(async (entry) => {
      let sourceName = "";
      let relevanceScore = 0;
      
      if (entry.fileId) {
        const [file] = await db
          .select({ fileName: files.fileName })
          .from(files)
          .where(eq(files.id, entry.fileId));
        sourceName = file?.fileName || "";
        
        // 计算相关性分数
        if (q && sourceName.toLowerCase().includes(q.toLowerCase())) {
          relevanceScore += 100; // 文件名匹配权重最高
        }
        if (q && entry.title?.toLowerCase().includes(q.toLowerCase())) {
          relevanceScore += 50; // 标题匹配
        }
      } else if (entry.noteId) {
        const [note] = await db
          .select({ title: notes.title })
          .from(notes)
          .where(eq(notes.id, entry.noteId));
        sourceName = note?.title || "";
        
        // 计算相关性分数
        if (q && sourceName.toLowerCase().includes(q.toLowerCase())) {
          relevanceScore += 100; // 笔记名匹配权重最高
        }
        if (q && entry.title?.toLowerCase().includes(q.toLowerCase())) {
          relevanceScore += 50; // 标题匹配
        }
      }
      
      return { ...entry, embedding: undefined, sourceName, relevanceScore };
    })
  );

  // 按相关性分数排序（分数高的在前）
  if (q) {
    enriched.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  }

  return NextResponse.json(enriched);
}
