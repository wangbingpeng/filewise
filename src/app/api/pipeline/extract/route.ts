import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { files, fileContents, folders, pipelineJobs, extractionCache } from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { extractFileContent } from "@/lib/pipeline/extractor";
import path from "path";
import { processInBatches } from "@/lib/pipeline/batch-processor";

export async function POST(request: Request) {
  ensureDbInitialized();
  const body = await request.json();
  const { folderId, fileIds } = body;

  if (!folderId) {
    return NextResponse.json({ error: "folderId 不能为空" }, { status: 400 });
  }

  const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
  if (!folder) {
    return NextResponse.json({ error: "文件夹不存在" }, { status: 404 });
  }

  // Get files to extract
  let filesToExtract;
  if (fileIds && fileIds.length > 0) {
    filesToExtract = await db.select().from(files)
      .where(and(eq(files.folderId, folderId), inArray(files.id, fileIds)));
  } else {
    filesToExtract = await db.select().from(files)
      .where(and(eq(files.folderId, folderId), eq(files.status, "discovered")));
  }

  // 方案1：文本提取缓存机制 + 方案E：智能跳过已成功阶段
  // 1. 先检查提取缓存（基于contentHash）
  // 2. 再检查fileContents表
  console.log(`[Extract] Checking extraction cache and existing contents...`);
  let skippedCount = 0;
  let cacheHitCount = 0;
  const filesNeedingExtract: typeof filesToExtract = [];
  
  for (const file of filesToExtract) {
    // 第一步：检查fileContents是否已有内容
    const existingContent = await db.select()
      .from(fileContents)
      .where(eq(fileContents.fileId, file.id))
      .limit(1);
    
    if (existingContent.length > 0 && existingContent[0].rawText) {
      await db.update(files)
        .set({ 
          status: "extracted", 
          updatedAt: Date.now(),
          errorMessage: null
        })
        .where(eq(files.id, file.id));
      skippedCount++;
      continue;
    }
    
    // 第二步：检查提取缓存（基于contentHash）
    if (file.contentHash) {
      const cachedExtraction = await db.select()
        .from(extractionCache)
        .where(eq(extractionCache.contentHash, file.contentHash))
        .limit(1);
      
      if (cachedExtraction.length > 0) {
        // 缓存命中，直接使用缓存结果
        const cache = cachedExtraction[0];
        await db.insert(fileContents).values({
          id: nanoid(),
          fileId: file.id,
          rawText: cache.rawText,
          charCount: cache.charCount,
          extractedAt: Date.now(),
        });
        
        // 更新缓存访问统计
        await db.update(extractionCache).set({
          accessCount: cache.accessCount + 1,
          lastAccessedAt: Date.now(),
        }).where(eq(extractionCache.id, cache.id));
        
        await db.update(files)
          .set({ status: "extracted", updatedAt: Date.now(), errorMessage: null })
          .where(eq(files.id, file.id));
        
        cacheHitCount++;
        skippedCount++;
        continue;
      }
    }
    
    // 需要提取
    filesNeedingExtract.push(file);
  }
  
  console.log(`[Extract] Cache hit: ${cacheHitCount}, Skipped total: ${skippedCount}`);
  console.log(`[Extract] ${filesNeedingExtract.length} files need extraction`);
  
  // 如果所有文件都已提取，直接返回
  if (filesNeedingExtract.length === 0) {
    const jobId = nanoid();
    const now = Date.now();
    await db.insert(pipelineJobs).values({
      id: jobId,
      folderId,
      stage: "extract",
      status: "completed",
      totalItems: filesToExtract.length,
      processedItems: filesToExtract.length,
      startedAt: now,
      completedAt: now,
      createdAt: now,
    });
    
    return NextResponse.json({ 
      success: true, 
      jobId, 
      total: filesToExtract.length, 
      extracted: 0,
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
    stage: "extract",
    status: "running",
    totalItems: filesNeedingExtract.length,
    processedItems: 0,
    startedAt: now,
    createdAt: now,
  });

  let extracted = 0;
  let errors = 0;
  const errorLog: Array<{fileId: string, error: string, timestamp: number}> = [];

  console.log(`[Extract] Starting extraction for ${filesNeedingExtract.length} files (skipped ${skippedCount})`);

  // Define the processor function for each file
  const extractFile = async (file: typeof filesNeedingExtract[0]) => {
    await db.update(files).set({ status: "extracting", updatedAt: Date.now() }).where(eq(files.id, file.id));

    const filePath = path.join(folder.path, file.relativePath);
    const result = await extractFileContent(filePath, file.extension);

    await db.insert(fileContents).values({
      id: nanoid(),
      fileId: file.id,
      rawText: result.text,
      charCount: result.text.length,
      summary: null,
      language: result.language || null,
      extractedAt: Date.now(),
    }).onConflictDoUpdate({
      target: fileContents.fileId,
      set: {
        rawText: result.text,
        charCount: result.text.length,
        extractedAt: Date.now(),
      },
    });

    // 方案1：保存到提取缓存（基于contentHash）
    if (file.contentHash) {
      await db.insert(extractionCache).values({
        id: nanoid(),
        contentHash: file.contentHash,
        fileName: file.fileName,
        extension: file.extension,
        rawText: result.text,
        charCount: result.text.length,
        metadata: JSON.stringify(result.metadata || {}),
        extractedAt: Date.now(),
        accessCount: 1,
        lastAccessedAt: Date.now(),
      }).onConflictDoUpdate({
        target: extractionCache.contentHash,
        set: {
          rawText: result.text,
          charCount: result.text.length,
          accessCount: sql`${extractionCache.accessCount} + 1`,
          lastAccessedAt: Date.now(),
        },
      });
    }

    await db.update(files).set({ status: "extracted", updatedAt: Date.now() }).where(eq(files.id, file.id));
  };

  // Process files in batches with real-time progress updates
  const batchResults = await processInBatches(
    filesNeedingExtract,
    async (file) => {
      try {
        await extractFile(file);
        extracted++;
      } catch (error) {
        errors++;
        const errorMessage = String(error);
        
        // 方案2: 跳过损坏文件，不标记为error
        const isCorruptedFile = 
          errorMessage.includes('DOMMatrix') ||
          errorMessage.includes('central directory') ||
          errorMessage.includes('文件损坏');
        
        if (isCorruptedFile) {
          // 文件损坏，标记为skipped而非error
          await db.update(files).set({
            status: "extracted", // 标记为extracted，让后续阶段跳过
            errorMessage: `文件损坏，跳过处理: ${errorMessage}`,
            updatedAt: Date.now(),
          }).where(eq(files.id, file.id));
        } else {
          // 其他错误，正常标记为error
          errorLog.push({ 
            fileId: file.id, 
            error: errorMessage, 
            timestamp: Date.now() 
          });
          
          await db.update(files).set({
            status: "error",
            errorMessage: errorMessage || "提取失败",
            updatedAt: Date.now(),
          }).where(eq(files.id, file.id));
        }
      }
    },
    {
      batchSize: 5, // 5 files concurrently (I/O bound)
      maxRetries: 1, // Retry once for I/O errors
      retryDelay: 500, // 0.5 seconds delay
      retryableErrors: ["ENOENT", "EACCES", "timeout"],
      // 方案4: Update progress after each batch - 包含跳过的文件
      onProgress: async (completed, total) => {
        await db.update(pipelineJobs).set({
          processedItems: completed + skippedCount, // 包含跳过的
          errorLog: JSON.stringify(errorLog),
        }).where(eq(pipelineJobs.id, jobId));
      },
    }
  );

  console.log(`[Extract] Completed: ${extracted} extracted, ${errors} errors out of ${filesNeedingExtract.length} files (skipped ${skippedCount})`);

  // Update job status
  await db.update(pipelineJobs).set({
    status: errors > 0 ? "completed" : "completed",
    processedItems: extracted + errors,
    completedAt: Date.now(),
  }).where(eq(pipelineJobs.id, jobId));

  return NextResponse.json({
    success: true,
    jobId,
    total: filesToExtract.length,
    extracted,
    errors,
  });
}
