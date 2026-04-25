import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { files, graphNodes, graphEdges, folders, pipelineJobs } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { chatCompletion } from "@/lib/ai/client";
import { ENTITY_EXTRACTION_PROMPT } from "@/lib/ai/prompts";
import { extractEntitiesFromFileName, isExtractionSufficient, ExtractionResult } from "@/lib/pipeline/entity-extractor";

export async function POST(request: Request) {
  ensureDbInitialized();
  const body = await request.json();
  const { folderId } = body;

  if (!folderId) {
    return NextResponse.json({ error: "folderId 不能为空" }, { status: 400 });
  }

  const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
  if (!folder) {
    return NextResponse.json({ error: "文件夹不存在" }, { status: 404 });
  }

  // Graph extraction only needs file name, so accept extracted or indexed status
  const filesToProcess = await db.select().from(files)
    .where(and(eq(files.folderId, folderId), inArray(files.status, ["extracted", "classified", "indexed"])));

  // Create pipeline job
  const jobId = nanoid();
  const now = Date.now();
  await db.insert(pipelineJobs).values({
    id: jobId,
    folderId,
    stage: "graph",
    status: "running",
    totalItems: filesToProcess.length,
    processedItems: 0,
    startedAt: now,
    createdAt: now,
  });

  // Update folder status
  await db.update(folders).set({ status: "processing", updatedAt: Date.now() }).where(eq(folders.id, folderId));

  let processed = 0;
  let errors = 0;
  const errorLog: Array<{fileId: string, error: string, timestamp: number}> = [];

  console.log(`[Graph] Starting graph extraction for ${filesToProcess.length} files`);

  // 处理实体的通用函数
  const processGraphEntities = async (file: typeof filesToProcess[0], parsed: ExtractionResult) => {
    const entities = parsed.entities;
    const entityNames = entities.map(e => e.name.trim().toLowerCase());
    const entityTypes = [...new Set(entities.map(e => e.type))];
    
    // 批量查询已存在的节点
    const existingNodes = entityNames.length > 0 && entityTypes.length > 0 ? await db.select()
      .from(graphNodes)
      .where(
        and(
          inArray(graphNodes.name, entityNames),
          inArray(graphNodes.entityType, entityTypes as [string, ...string[]])
        )
      ) : [];
    
    // 构建Map用于快速查找
    const existingNodeMap = new Map<string, typeof graphNodes.$inferSelect>();
    for (const node of existingNodes) {
      const key = `${node.name}|${node.entityType}`;
      existingNodeMap.set(key, node);
    }

    // Upsert entities
    const entityIdMap: Record<string, string> = {};
    const nodesToInsert: Array<typeof graphNodes.$inferInsert> = [];
    const nodesToUpdate: Array<{id: string, mentionCount: number}> = [];

    for (const entity of entities) {
      const name = entity.name.trim().toLowerCase();
      const entityType = entity.type;
      const key = `${name}|${entityType}`;
      
      const existing = existingNodeMap.get(key);

      if (existing) {
        entityIdMap[entity.name] = existing.id;
        nodesToUpdate.push({
          id: existing.id,
          mentionCount: existing.mentionCount + 1
        });
      } else {
        const nodeId = nanoid();
        entityIdMap[entity.name] = nodeId;
        nodesToInsert.push({
          id: nodeId,
          name,
          entityType,
          description: entity.description || null,
          mentionCount: 1,
          createdAt: Date.now(),
        });
      }
    }

    // 批量插入和更新节点
    if (nodesToInsert.length > 0) {
      await db.insert(graphNodes).values(nodesToInsert);
    }
    
    if (nodesToUpdate.length > 0) {
      for (const update of nodesToUpdate) {
        await db.update(graphNodes)
          .set({ mentionCount: update.mentionCount })
          .where(eq(graphNodes.id, update.id));
      }
    }

    // Insert relationships - 批量插入
    const relationships = parsed.relationships.filter(r => 
      r.source && r.target && entityIdMap[r.source] && entityIdMap[r.target]
    );
    
    if (relationships.length > 0) {
      const edgesToInsert = relationships.map((rel) => ({
        id: nanoid(),
        sourceNodeId: entityIdMap[rel.source],
        targetNodeId: entityIdMap[rel.target],
        relationship: rel.relationship || "related_to",
        weight: 1.0,
        sourceFileId: file.id,
        createdAt: Date.now(),
      }));
      
      await db.insert(graphEdges).values(edgesToInsert);
    }
  };

  // 单个文件AI提取
  const extractGraphSingle = async (file: typeof filesToProcess[0]) => {
    const extension = file.fileName.split('.').pop() || '';
    const prompt = ENTITY_EXTRACTION_PROMPT
      .replace("{fileName}", file.fileName)
      .replace("{extension}", extension);

    const result = await chatCompletion([
      { role: "user", content: prompt },
    ], { temperature: 0.1 });

    const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    await processGraphEntities(file, parsed);
  };

  // 批量AI调用
  const processBatch = async (batch: typeof filesToProcess) => {
    if (batch.length === 1) {
      await extractGraphSingle(batch[0]);
      return;
    }

    const batchPrompt = `你是一个知识图谱构建专家。请从以下文件名中提取关键实体和关系。

实体类型：
- project: 项目名称
- technology: 技术/产品
- topic: 主题领域
- person: 人物姓名
- organization: 组织/公司名
- file: 文件本身（必须包含）

请处理以下${batch.length}个文件（索引从0开始）：
${batch.map((f, i) => `${i}. ${f.fileName}`).join('\n')}

请以JSON数组返回，每个文件一个对象：
[
  {
    "fileIndex": 0,
    "entities": [
      {"name": "文件名", "type": "file", "description": ""},
      {"name": "实体名", "type": "technology", "description": "描述"}
    ],
    "relationships": [
      {"source": "文件名", "target": "实体名", "relationship": "关于"}
    ]
  }
]

只返回JSON，不要其他内容。`;

    const result = await chatCompletion([
      { role: "user", content: batchPrompt },
    ], { temperature: 0.1 });

    const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const batchResults = JSON.parse(cleaned);

    // 如果AI没有返回fileIndex，按顺序分配
    if (!batchResults[0].fileIndex) {
      batchResults.forEach((r: any, i: number) => {
        r.fileIndex = i;
      });
    }

    for (let i = 0; i < batch.length; i++) {
      const file = batch[i];
      const parsed = batchResults.find((r: any) => r.fileIndex === i);
      
      if (!parsed) {
        throw new Error(`未找到文件 ${file.fileName} 的解析结果`);
      }

      await processGraphEntities(file, parsed);
    }
  };

  // 规则提取 + AI补充策略
  let ruleProcessed = 0;
  let aiProcessed = 0;
  const aiFiles: typeof filesToProcess = [];

  // 第一步：规则提取所有文件
  console.log(`[Graph] Phase 1: Rule-based extraction for all files`);
  for (const file of filesToProcess) {
    try {
      const ruleResult = extractEntitiesFromFileName(file.fileName);
      
      if (isExtractionSufficient(ruleResult)) {
        // 规则提取充分，直接处理
        await processGraphEntities(file, ruleResult);
        ruleProcessed++;
      } else {
        // 规则提取不充分，留待AI处理
        aiFiles.push(file);
      }
    } catch (error) {
      console.error(`[Graph] Rule extraction failed for ${file.fileName}:`, error);
      aiFiles.push(file);
    }
    
    // 每100个文件更新一次进度
    if ((ruleProcessed + aiFiles.length) % 100 === 0) {
      await db.update(pipelineJobs).set({
        processedItems: ruleProcessed + aiFiles.length,
      }).where(eq(pipelineJobs.id, jobId));
    }
  }

  console.log(`[Graph] Rule extraction completed: ${ruleProcessed} files, ${aiFiles.length} files need AI`);

  // 第二步：AI处理规则无法识别的文件
  if (aiFiles.length > 0) {
    console.log(`[Graph] Phase 2: AI extraction for ${aiFiles.length} files`);
    
    for (let i = 0; i < aiFiles.length; i += 10) {
      const batch = aiFiles.slice(i, i + 10);
      
      try {
        if (batch.length === 1) {
          await extractGraphSingle(batch[0]);
        } else {
          await processBatch(batch);
        }
        aiProcessed += batch.length;
      } catch (error) {
        console.error(`[Graph] AI batch processing failed:`, error);
        // 降级为单个处理
        for (const file of batch) {
          try {
            await extractGraphSingle(file);
            aiProcessed++;
          } catch (singleError) {
            errors++;
            errorLog.push({ 
              fileId: file.id, 
              error: String(singleError), 
              timestamp: Date.now() 
            });
          }
        }
      }
      
      // 更新进度
      await db.update(pipelineJobs).set({
        processedItems: ruleProcessed + aiProcessed,
        errorLog: JSON.stringify(errorLog),
      }).where(eq(pipelineJobs.id, jobId));
      
      console.log(`[Graph] AI Progress: ${ruleProcessed + aiProcessed}/${filesToProcess.length} (${Math.round((ruleProcessed + aiProcessed) / filesToProcess.length * 100)}%)`);
    }
  }

  console.log(`[Graph] Completed: ${ruleProcessed} rule-extracted, ${aiProcessed} AI-extracted, ${errors} errors`);

  // Update job status
  await db.update(pipelineJobs).set({
    status: "completed",
    processedItems: ruleProcessed + aiProcessed + errors,
    completedAt: Date.now(),
  }).where(eq(pipelineJobs.id, jobId));

  return NextResponse.json({ 
    success: true, 
    jobId, 
    total: filesToProcess.length, 
    processed: ruleProcessed + aiProcessed,
    ruleProcessed,
    aiProcessed,
    errors 
  });
}
