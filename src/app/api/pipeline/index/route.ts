import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { files, fileContents, knowledgeEntries, pipelineJobs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { generateEmbeddings, serializeEmbedding } from "@/lib/ai/embeddings";
import { sqlite } from "@/lib/db";
import { processInBatches } from "@/lib/pipeline/batch-processor";

function chunkText(text: string, chunkSize = 2000, overlap = 200): string[] {
  const chunks: string[] = [];
  if (text.length <= chunkSize) {
    chunks.push(text);
    return chunks;
  }

  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;
    // Try to break at paragraph or sentence boundary
    if (end < text.length) {
      const lastParagraph = text.lastIndexOf("\n\n", end);
      if (lastParagraph > start + chunkSize / 2) {
        end = lastParagraph;
      } else {
        const lastSentence = text.lastIndexOf("。", end);
        if (lastSentence > start + chunkSize / 2) {
          end = lastSentence + 1;
        }
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks.filter((c) => c.length > 0);
}

export async function POST(request: Request) {
  ensureDbInitialized();
  const body = await request.json();
  const { folderId } = body;

  if (!folderId) {
    return NextResponse.json({ error: "folderId 不能为空" }, { status: 400 });
  }

  const filesToIndex = await db.select().from(files)
    .where(and(eq(files.folderId, folderId), eq(files.status, "classified")));

  // 方案E: 智能跳过已成功阶段
  // 检查文件是否已有知识条目（embedding），如果有则跳过
  console.log(`[Index] Checking for existing knowledge entries...`);
  let skippedCount = 0;
  const filesNeedingIndex: typeof filesToIndex = [];
  
  for (const file of filesToIndex) {
    // 检查是否已有知识条目
    const existingEntries = await db.select()
      .from(knowledgeEntries)
      .where(eq(knowledgeEntries.fileId, file.id))
      .limit(1);
    
    if (existingEntries.length > 0) {
      // 已有embedding，直接标记为indexed
      await db.update(files)
        .set({ 
          status: "indexed", 
          updatedAt: Date.now(),
          errorMessage: null // 清除之前的错误
        })
        .where(eq(files.id, file.id));
      skippedCount++;
    } else {
      // 需要索引
      filesNeedingIndex.push(file);
    }
  }
  
  console.log(`[Index] Skipped ${skippedCount} files with existing embeddings`);
  console.log(`[Index] ${filesNeedingIndex.length} files need indexing`);
  
  // 如果所有文件都已索引，直接返回
  if (filesNeedingIndex.length === 0) {
    const jobId = nanoid();
    const now = Date.now();
    await db.insert(pipelineJobs).values({
      id: jobId,
      folderId,
      stage: "index",
      status: "completed",
      totalItems: filesToIndex.length,
      processedItems: filesToIndex.length,
      startedAt: now,
      completedAt: now,
      createdAt: now,
    });
    
    return NextResponse.json({ 
      success: true, 
      jobId, 
      total: filesToIndex.length, 
      indexed: 0,
      skipped: skippedCount,
      errors: 0 
    });
  }

  // Create pipeline job
  const jobId = nanoid();
  const now = Date.now();
  await db.insert(pipelineJobs).values({
    id: jobId,
    folderId,
    stage: "index",
    status: "running",
    totalItems: filesNeedingIndex.length,
    processedItems: 0,
    startedAt: now,
    createdAt: now,
  });

  let indexed = 0;
  let errors = 0;
  const errorLog: Array<{fileId: string, error: string, timestamp: number}> = [];

  console.log(`[Index] Starting indexing for ${filesNeedingIndex.length} files (skipped ${skippedCount})`);

  // 方案1：分批生成+渐进式写入
  // 方案2：并行Embedding生成（低并发避免429限流）
  const BATCH_SIZE = 30; // 每批处理30个文件
  const EMBEDDING_BATCH_SIZE = 25; // embedding API batch size（API限制最大25）
  const PARALLEL_COUNT = 2; // 并发数（低并发避免429，减少重试等待）
  const BATCH_DELAY = 500; // 批次间隔500ms，避免连续触发限流
  
  // 分批处理文件
  for (let batchStart = 0; batchStart < filesNeedingIndex.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, filesNeedingIndex.length);
    const fileBatch = filesNeedingIndex.slice(batchStart, batchEnd);
    
    console.log(`[Index] Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: files ${batchStart + 1}-${batchEnd}`);
    
    // 1. 收集这批文件的chunks
    interface FileChunk {
      fileId: string;
      fileName: string;
      chunk: string;
      chunkIndex: number;
    }
    
    const batchChunks: FileChunk[] = [];
    const fileIdToFileMap = new Map<string, typeof filesNeedingIndex[0]>();
    
    for (const file of fileBatch) {
      const [content] = await db.select().from(fileContents).where(eq(fileContents.fileId, file.id));
      if (!content || !content.rawText) {
        continue;
      }
      
      fileIdToFileMap.set(file.id, file);
      const chunks = chunkText(content.rawText, 2000, 200); // 限制2000字符以匹配embedding模型限制
      chunks.forEach((chunk, i) => {
        batchChunks.push({
          fileId: file.id,
          fileName: file.fileName,
          chunk,
          chunkIndex: i,
        });
      });
    }
    
    if (batchChunks.length === 0) {
      continue;
    }
    
    console.log(`[Index] Batch chunks: ${batchChunks.length}`);
    
    // 2. 方案2：并行生成embeddings
    const embeddings: number[][] = [];
    const totalBatches = Math.ceil(batchChunks.length / EMBEDDING_BATCH_SIZE);
    
    for (let i = 0; i < batchChunks.length; i += EMBEDDING_BATCH_SIZE * PARALLEL_COUNT) {
      const parallelPromises: Promise<number[][]>[] = [];
      
      // 创建PARALLEL_COUNT个并发任务
      for (let j = 0; j < PARALLEL_COUNT; j++) {
        const startIdx = i + j * EMBEDDING_BATCH_SIZE;
        if (startIdx >= batchChunks.length) break;
        
        const endIdx = Math.min(startIdx + EMBEDDING_BATCH_SIZE, batchChunks.length);
        const texts = batchChunks.slice(startIdx, endIdx).map(c => c.chunk);
        
        parallelPromises.push(generateEmbeddings(texts));
      }
      
      // 等待并发任务完成
      const results = await Promise.all(parallelPromises);
      
      // 合并结果
      for (const result of results) {
        embeddings.push(...result);
      }
      
      // 进度日志
      const completedBatches = Math.min(Math.floor(i / EMBEDDING_BATCH_SIZE) + PARALLEL_COUNT, totalBatches);
      if (completedBatches % 10 === 0 || completedBatches === totalBatches) {
        console.log(`[Index] Embeddings progress: ${completedBatches}/${totalBatches} batches`);
      }
    }
    
    console.log(`[Index] Batch embeddings generated: ${embeddings.length}`);
    
    // 3. 按文件分组，批量写入数据库
    const indexTime = Date.now();
    const fileChunksMap = new Map<string, Array<FileChunk & { embedding: number[] }>>();
    
    for (let i = 0; i < batchChunks.length; i++) {
      const chunkData = batchChunks[i];
      if (!fileChunksMap.has(chunkData.fileId)) {
        fileChunksMap.set(chunkData.fileId, []);
      }
      fileChunksMap.get(chunkData.fileId)!.push({
        ...chunkData,
        embedding: embeddings[i],
      });
    }
    
    // 4. 逐文件写入
    for (const [fileId, chunks] of fileChunksMap.entries()) {
      try {
        const entries = chunks.map((c) => ({
          id: nanoid(),
          fileId: c.fileId,
          sourceType: "file" as const,
          chunkIndex: c.chunkIndex,
          title: `${c.fileName} - 片段 ${c.chunkIndex + 1}`,
          content: c.chunk,
          embedding: serializeEmbedding(c.embedding),
          createdAt: indexTime,
        }));
        
        // 使用事务批量插入（SQLite不支持async事务回调）
        db.transaction((tx) => {
          tx.insert(knowledgeEntries).values(entries).run();
        });
        
        // 批量更新FTS索引
        try {
          const ftsQueries = entries
            .map((entry) => 
              `INSERT INTO knowledge_fts(rowid, title, content) VALUES (
                (SELECT rowid FROM knowledge_entries WHERE id = '${entry.id}'),
                '${entry.title.replace(/'/g, "''")}',
                '${entry.content.replace(/'/g, "''")}'
              )`
            )
            .join('; ');
          
          if (ftsQueries) {
            sqlite.exec(`BEGIN; ${ftsQueries}; COMMIT;`);
          }
        } catch {
          // FTS insert may fail, not critical
        }
        
        await db.update(files).set({ status: "indexed", updatedAt: Date.now() }).where(eq(files.id, fileId));
        indexed++;
      } catch (error) {
        errors++;
        const errorMessage = String(error);
        errorLog.push({ 
          fileId, 
          error: errorMessage, 
          timestamp: Date.now() 
        });
        
        await db.update(files).set({
          status: "error",
          errorMessage: `索引失败: ${errorMessage}`,
          updatedAt: Date.now(),
        }).where(eq(files.id, fileId));
      }
    }
    
    // 5. 更新进度（每批更新）
    await db.update(pipelineJobs).set({
      processedItems: indexed,
      errorLog: JSON.stringify(errorLog),
    }).where(eq(pipelineJobs.id, jobId));
    
    console.log(`[Index] Batch completed: ${indexed}/${filesNeedingIndex.length} files indexed`);
    
    // 批次间短暂延迟，避免连续触发429限流
    if (BATCH_DELAY > 0) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }

  console.log(`[Index] Completed: ${indexed} indexed, ${errors} errors out of ${filesNeedingIndex.length} files`);

  // Update job status
  await db.update(pipelineJobs).set({
    status: "completed",
    processedItems: indexed + errors,
    completedAt: Date.now(),
  }).where(eq(pipelineJobs.id, jobId));

  return NextResponse.json({ success: true, jobId, total: filesNeedingIndex.length, indexed, errors });
}
