import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { files, graphNodes, graphEdges } from "../src/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

const sqlite = new Database("data/filewise.db");
const db = drizzle(sqlite);

// Load AI settings from data/settings.json
function getAISettings() {
  const settingsPath = path.join(process.cwd(), "data", "settings.json");
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    }
  } catch {
    // ignore
  }
  return {
    apiKey: process.env.DASHSCOPE_API_KEY || "",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
  };
}

const ENTITY_EXTRACTION_PROMPT = `你是一个知识图谱构建专家。请从文件名中提取关键实体。

实体类型：
- project: 项目名称（如：智慧城市、电商平台、数据分析等）
- technology: 技术/产品（如：PostgreSQL、Kubernetes、AI、数据库等）
- topic: 主题领域（如：运维、介绍、方案、案例等）
- person: 人物姓名
- organization: 组织/公司名（如：Microsoft、Google等）
- file: 文件本身（必须包含）

提取规则：
1. 文件本身必须作为第一个实体，type 为 file，name 为完整文件名（含扩展名）
2. 从文件名中识别项目、产品、技术名称（英文缩写如 CRM、ERP、BI 等通常是产品名）
3. 识别文档主题（如：介绍、方案、案例、总结等）
4. 识别公司或组织名称
5. 实体名称要标准化：同一产品用统一名称（如 CRM 不要拆分为 C、R、M）

关系构建：
- source 始终是文件名
- target 是提取出的实体
- relationship 描述文件与实体的关系（属于/关于/使用/介绍/案例等）

请严格返回以下 JSON 格式（不要加 markdown 代码块）：
{
  "entities": [
    {"name": "完整文件名.pdf", "type": "file", "description": "PDF文档"},
    {"name": "产品名", "type": "project", "description": "简要说明"},
    {"name": "技术名", "type": "technology", "description": "简要说明"},
    {"name": "主题", "type": "topic", "description": "简要说明"}
  ],
  "relationships": [
    {"source": "完整文件名.pdf", "target": "产品名", "relationship": "属于"},
    {"source": "完整文件名.pdf", "target": "技术名", "relationship": "使用"},
    {"source": "完整文件名.pdf", "target": "主题", "relationship": "关于"}
  ]
}

文件名: {fileName}
文件类型: {extension}`;

async function callAI(prompt: string): Promise<string> {
  const settings = getAISettings();
  if (!settings.apiKey) throw new Error("API Key not configured");

  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl,
  });

  const response = await client.chat.completions.create({
    model: settings.model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
  });

  return response.choices[0]?.message?.content || "";
}

async function main() {
  console.log("Starting graph rebuild...\n");

  // Clear existing data
  console.log("Clearing existing graph data...");
  sqlite.exec("DELETE FROM graph_edges");
  sqlite.exec("DELETE FROM graph_nodes");
  console.log("Done.\n");

  // Get all files with valid status
  const filesToProcess = await db.select().from(files)
    .where(inArray(files.status, ["extracted", "classified", "indexed"]));
  
  console.log(`Found ${filesToProcess.length} files to process\n`);

  let processed = 0;
  let errors = 0;
  const entityIdMap: Record<string, string> = {};

  for (const file of filesToProcess) {
    try {
      const extension = file.fileName.split('.').pop() || '';
      const prompt = ENTITY_EXTRACTION_PROMPT
        .replace("{fileName}", file.fileName)
        .replace("{extension}", extension);
      
      console.log(`Processing: ${file.fileName}`);
      const result = await callAI(prompt);
      
      const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      const now = Date.now();
      
      for (const entity of (parsed.entities || [])) {
        const name = (entity.name || "").trim().toLowerCase();
        const entityType = entity.type || "concept";
        if (!name) continue;
        
        const existing = await db.select().from(graphNodes)
          .where(and(eq(graphNodes.name, name), eq(graphNodes.entityType, entityType)))
          .limit(1);
        
        if (existing.length > 0) {
          entityIdMap[entity.name] = existing[0].id;
          await db.update(graphNodes)
            .set({ mentionCount: existing[0].mentionCount + 1 })
            .where(eq(graphNodes.id, existing[0].id));
        } else {
          const nodeId = nanoid();
          entityIdMap[entity.name] = nodeId;
          await db.insert(graphNodes).values({
            id: nodeId,
            name,
            entityType,
            description: entity.description || null,
            mentionCount: 1,
            createdAt: now,
          });
        }
      }
      
      for (const rel of (parsed.relationships || [])) {
        const sourceId = entityIdMap[rel.source];
        const targetId = entityIdMap[rel.target];
        if (!sourceId || !targetId) continue;
        
        await db.insert(graphEdges).values({
          id: nanoid(),
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          relationship: rel.relationship || "related_to",
          weight: 1.0,
          sourceFileId: file.id,
          createdAt: now,
        });
      }
      
      processed++;
      console.log(`  ✓ Done (${processed}/${filesToProcess.length})\n`);
    } catch (error: any) {
      errors++;
      console.error(`  ✗ Error: ${error.message}\n`);
    }
  }
  
  console.log(`\n=== Complete ===`);
  console.log(`Processed: ${processed}, Errors: ${errors}`);
  
  // Show stats
  const nodes = await db.select().from(graphNodes);
  const edges = await db.select().from(graphEdges);
  console.log(`\nGraph stats: ${nodes.length} nodes, ${edges.length} edges`);
  
  // Show node types
  const nodeTypes: Record<string, number> = {};
  for (const node of nodes) {
    nodeTypes[node.entityType] = (nodeTypes[node.entityType] || 0) + 1;
  }
  console.log("\nNode types:");
  for (const [type, count] of Object.entries(nodeTypes)) {
    console.log(`  ${type}: ${count}`);
  }

  sqlite.close();
}

main().catch(console.error);
