import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { files, fileContents, classifications, pipelineJobs } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { chatCompletion } from "@/lib/ai/client";
import { CLASSIFICATION_PROMPT, BATCH_CLASSIFICATION_PROMPT } from "@/lib/ai/prompts";
import { processInBatches, isRetryableError, isNonRetryableError } from "@/lib/pipeline/batch-processor";
import { classifyByRules } from "@/lib/pipeline/rule-classifier";

export async function POST(request: Request) {
  ensureDbInitialized();
  const body = await request.json();
  const { folderId, fileIds } = body;

  if (!folderId) {
    return NextResponse.json({ error: "folderId 不能为空" }, { status: 400 });
  }

  // Get files to classify
  let filesToClassify;
  if (fileIds && fileIds.length > 0) {
    filesToClassify = await db.select().from(files)
      .where(and(eq(files.folderId, folderId), inArray(files.id, fileIds)));
  } else {
    filesToClassify = await db.select().from(files)
      .where(and(eq(files.folderId, folderId), eq(files.status, "extracted")));
  }

  // 方案A+E: 智能跳过已成功阶段
  // 检查文件是否已有分类结果，如果有则跳过
  console.log(`[Classify] Checking for existing classifications...`);
  let skippedCount = 0;
  const filesNeedingClassification: typeof filesToClassify = [];
  
  for (const file of filesToClassify) {
    // 检查是否已有分类
    const existingClassification = await db.select()
      .from(classifications)
      .where(eq(classifications.fileId, file.id))
      .limit(1);
    
    if (existingClassification.length > 0) {
      // 已有分类，直接标记为classified
      await db.update(files)
        .set({ 
          status: "classified", 
          updatedAt: Date.now(),
          errorMessage: null // 清除之前的错误
        })
        .where(eq(files.id, file.id));
      skippedCount++;
    } else {
      // 需要分类
      filesNeedingClassification.push(file);
    }
  }
  
  console.log(`[Classify] Skipped ${skippedCount} files with existing classifications`);
  console.log(`[Classify] ${filesNeedingClassification.length} files need classification`);
  
  // 如果所有文件都已分类，直接返回
  if (filesNeedingClassification.length === 0) {
    const jobId = nanoid();
    const now = Date.now();
    await db.insert(pipelineJobs).values({
      id: jobId,
      folderId,
      stage: "classify",
      status: "completed",
      totalItems: filesToClassify.length,
      processedItems: filesToClassify.length,
      startedAt: now,
      completedAt: now,
      createdAt: now,
    });
    
    return NextResponse.json({ 
      success: true, 
      jobId, 
      total: filesToClassify.length, 
      classified: 0,
      skipped: skippedCount,
      errors: 0 
    });
  }

  // Create pipeline job for files needing classification
  const jobId = nanoid();
  const now = Date.now();
  await db.insert(pipelineJobs).values({
    id: jobId,
    folderId,
    stage: "classify",
    status: "running",
    totalItems: filesNeedingClassification.length,
    processedItems: 0,
    startedAt: now,
    createdAt: now,
  });

  // Progress tracking
  let classified = 0;
  let errors = 0;
  const errorLog: Array<{fileId: string, error: string, timestamp: number}> = [];
  const progressMutex = { success: 0, errors: 0 };

  console.log(`[Classify] Starting classification for ${filesNeedingClassification.length} files (skipped ${skippedCount})`);

  // 方案6：批量AI分类 - 收集需要AI分类的文件
  const filesNeedingAI: typeof filesNeedingClassification = [];
  const ruleClassifiedFiles: Array<{file: typeof filesNeedingClassification[0], result: any}> = [];
  
  // 第一步：规则分类
  for (const file of filesNeedingClassification) {
    const [content] = await db.select().from(fileContents).where(eq(fileContents.fileId, file.id));
    if (!content || !content.rawText) {
      continue; // 跳过内容为空的
    }
    
    const ruleResult = classifyByRules(file.fileName, content.rawText.slice(0, 500));
    if (ruleResult) {
      ruleClassifiedFiles.push({ file, result: ruleResult });
    } else {
      filesNeedingAI.push(file);
    }
  }
  
  console.log(`[Classify] Rule classified: ${ruleClassifiedFiles.length}, Need AI: ${filesNeedingAI.length}`);
  
  // 第二步：保存规则分类结果
  for (const { file, result } of ruleClassifiedFiles) {
    await db.insert(classifications).values({
      id: nanoid(),
      fileId: file.id,
      primaryCategory: result.primaryCategory,
      secondaryCategory: result.secondaryCategory,
      tags: JSON.stringify(result.tags),
      confidence: result.confidence,
      reasoning: result.reasoning,
      classifiedAt: Date.now(),
    }).onConflictDoUpdate({
      target: classifications.fileId,
      set: {
        primaryCategory: result.primaryCategory,
        secondaryCategory: result.secondaryCategory,
        tags: JSON.stringify(result.tags),
        confidence: result.confidence,
        reasoning: result.reasoning,
        classifiedAt: Date.now(),
      },
    });
    
    if (result.summary) {
      await db.update(fileContents).set({ summary: result.summary }).where(eq(fileContents.fileId, file.id));
    }
    
    await db.update(files).set({ status: "classified", updatedAt: Date.now() }).where(eq(files.id, file.id));
    classified++;
  }

  // 第三步：批量AI分类
  const classifyFile = async (file: typeof filesNeedingAI[0]) => {
    // Get extracted content
    const [content] = await db.select().from(fileContents).where(eq(fileContents.fileId, file.id));
    if (!content || !content.rawText) {
      throw new Error("文件内容为空");
    }

    // 直接使用AI分类（规则分类已提前处理）
    const prompt = CLASSIFICATION_PROMPT
      .replace("{fileName}", file.fileName)
      .replace("{extension}", file.extension)
      .replace("{content}", content.rawText.slice(0, 2000));

    const result = await chatCompletion([
      { role: "user", content: prompt },
    ], { temperature: 0.1 });

    // Parse JSON response
    const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    await db.insert(classifications).values({
      id: nanoid(),
      fileId: file.id,
      primaryCategory: parsed.primaryCategory || "其他",
      secondaryCategory: parsed.secondaryCategory || null,
      tags: JSON.stringify(parsed.tags || []),
      confidence: parsed.confidence || 0.5,
      reasoning: parsed.reasoning || null,
      classifiedAt: Date.now(),
    }).onConflictDoUpdate({
      target: classifications.fileId,
      set: {
        primaryCategory: parsed.primaryCategory || "其他",
        secondaryCategory: parsed.secondaryCategory || null,
        tags: JSON.stringify(parsed.tags || []),
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || null,
        classifiedAt: Date.now(),
      },
    });

    // Update summary in file_contents
    if (parsed.summary) {
      await db.update(fileContents).set({ summary: parsed.summary }).where(eq(fileContents.fileId, file.id));
    }

    await db.update(files).set({ status: "classified", updatedAt: Date.now() }).where(eq(files.id, file.id));
  };

  // Process files in batches with retry and real-time progress updates
  const batchResults = await processInBatches(
    filesNeedingAI, // 只处理需要AI分类的文件
    async (file) => {
      try {
        await classifyFile(file);
        classified++;
      } catch (error) {
        errors++;
        const errorMessage = String(error);
        errorLog.push({ 
          fileId: file.id, 
          error: errorMessage, 
          timestamp: Date.now() 
        });
        
        // Update file status to error
        await db.update(files).set({
          status: "error",
          errorMessage: `分类失败: ${errorMessage}`,
          updatedAt: Date.now(),
        }).where(eq(files.id, file.id));
      }
    },
    {
      batchSize: 20, // 方案1: 从10提升到20
      maxRetries: 2, // 方案6: 从3减少到2
      retryDelay: 2000, // 方案6: 从3000减少到2000
      retryableErrors: ["Connection error", "Request timed out", "timeout", "429"],
      // 方案4: Update progress after each batch - 包含跳过的文件
      onProgress: async (completed, total) => {
        await db.update(pipelineJobs).set({
          processedItems: completed + skippedCount, // 包含跳过的
          errorLog: JSON.stringify(errorLog),
        }).where(eq(pipelineJobs.id, jobId));
      },
    }
  );

  console.log(`[Classify] Completed: ${classified} classified, ${errors} errors out of ${filesToClassify.length} files`);

  // Update job status to completed
  await db.update(pipelineJobs).set({
    status: "completed",
    processedItems: classified + errors,
    completedAt: Date.now(),
  }).where(eq(pipelineJobs.id, jobId));

  return NextResponse.json({ success: true, jobId, total: filesToClassify.length, classified, errors });
}
