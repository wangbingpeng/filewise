/**
 * 重建 FTS 索引脚本
 * 
 * 运行方式：npx tsx scripts/rebuild-fts-index.ts
 */

import { db, sqlite } from "@/lib/db";
import { knowledgeEntries } from "@/lib/db/schema";

async function rebuildFTSIndex() {
  console.log("开始重建 FTS 索引...");
  
  // 清空 FTS 索引
  console.log("清空现有 FTS 索引...");
  sqlite.exec(`DELETE FROM knowledge_fts`);
  
  // 获取所有知识条目（包括 rowid）
  const allEntries = sqlite.prepare(
    `SELECT rowid, * FROM knowledge_entries`
  ).all() as Array<{ rowid: number; id: string; title: string | null; content: string }>;
  console.log(`找到 ${allEntries.length} 条知识条目`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const entry of allEntries) {
    try {
      // 插入 FTS 索引
      sqlite.exec(
        `INSERT INTO knowledge_fts(rowid, title, content) VALUES (
          ${entry.rowid || null},
          '${(entry.title || '').replace(/'/g, "''")}',
          '${entry.content.replace(/'/g, "''")}'
        )`
      );
      
      successCount++;
      if (successCount % 10 === 0) {
        console.log(`已处理 ${successCount} 条...`);
      }
    } catch (error) {
      errorCount++;
      if (errorCount <= 5) {
        console.error(`索引创建失败 (ID: ${entry.id}):`, error);
      }
    }
  }
  
  console.log("\n重建完成！");
  console.log(`成功: ${successCount} 条`);
  console.log(`失败: ${errorCount} 条`);
}

// 执行重建
rebuildFTSIndex()
  .then(() => {
    console.log("\nFTS 索引重建完成");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n重建过程中发生错误:", error);
    process.exit(1);
  });
