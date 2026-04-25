/**
 * 数据迁移脚本：为已有笔记的知识条目生成 embedding
 * 
 * 运行方式：npx tsx scripts/migrate-notes-embedding.ts
 */

import { db } from "@/lib/db";
import { knowledgeEntries } from "@/lib/db/schema";
import { eq, isNotNull, isNull } from "drizzle-orm";
import { generateEmbedding, serializeEmbedding } from "@/lib/ai/embeddings";

async function migrateNotesEmbedding() {
  console.log("开始为笔记知识条目生成 embedding...");
  
  // 获取所有笔记类型的知识条目（没有 embedding 的）
  const noteEntries = await db.select()
    .from(knowledgeEntries)
    .where(eq(knowledgeEntries.sourceType, "note"));
  
  console.log(`找到 ${noteEntries.length} 条笔记知识条目`);
  
  // 过滤出没有 embedding 的条目
  const entriesWithoutEmbedding = noteEntries.filter(entry => !entry.embedding);
  console.log(`其中 ${entriesWithoutEmbedding.length} 条缺少 embedding`);
  
  if (entriesWithoutEmbedding.length === 0) {
    console.log("所有笔记已有 embedding，无需迁移");
    return;
  }
  
  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;
  
  for (const entry of entriesWithoutEmbedding) {
    try {
      console.log(`\n处理: ${entry.title || '无标题'} (ID: ${entry.id})`);
      
      // 生成 embedding（限制内容长度）
      const contentToEmbed = entry.content.slice(0, 2000);
      const embeddingArray = await generateEmbedding(contentToEmbed);
      const embeddingBuffer = serializeEmbedding(embeddingArray);
      
      // 更新数据库
      await db.update(knowledgeEntries)
        .set({ embedding: embeddingBuffer })
        .where(eq(knowledgeEntries.id, entry.id));
      
      successCount++;
      console.log(`✓ 成功 (${successCount}/${entriesWithoutEmbedding.length})`);
    } catch (error) {
      errorCount++;
      console.error(`✗ 失败: ${error}`);
    }
  }
  
  console.log("\n========== 迁移完成 ==========");
  console.log(`成功: ${successCount} 条`);
  console.log(`失败: ${errorCount} 条`);
  console.log(`跳过: ${skipCount} 条`);
  console.log("================================");
}

// 执行迁移
migrateNotesEmbedding()
  .then(() => {
    console.log("\n所有迁移任务完成");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n迁移过程中发生错误:", error);
    process.exit(1);
  });
