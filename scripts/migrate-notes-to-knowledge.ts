/**
 * 数据迁移脚本：为已有笔记创建知识条目和 FTS 索引
 * 
 * 运行方式：npx tsx scripts/migrate-notes-to-knowledge.ts
 */

import { db, sqlite } from "@/lib/db";
import { notes, knowledgeEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function migrateNotesToKnowledge() {
  console.log("开始迁移笔记到知识库...");
  
  // 获取所有笔记
  const allNotes = await db.select().from(notes);
  console.log(`找到 ${allNotes.length} 条笔记`);
  
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  
  for (const note of allNotes) {
    try {
      const knowledgeId = `note_${note.id}`;
      
      // 检查是否已经存在
      const existing = await db.select()
        .from(knowledgeEntries)
        .where(eq(knowledgeEntries.id, knowledgeId))
        .get();
      
      if (existing) {
        console.log(`跳过已存在的笔记: ${note.title}`);
        skipCount++;
        continue;
      }
      
      // 创建知识条目
      await db.insert(knowledgeEntries).values({
        id: knowledgeId,
        noteId: note.id,
        sourceType: "note",
        chunkIndex: 0,
        title: note.title,
        content: note.content,
        createdAt: note.createdAt,
      });
      
      // 插入 FTS 索引（使用 INSERT OR REPLACE）
      try {
        sqlite.exec(
          `INSERT OR REPLACE INTO knowledge_fts(rowid, title, content) VALUES (
            (SELECT rowid FROM knowledge_entries WHERE id = '${knowledgeId}'),
            '${note.title.replace(/'/g, "''")}',
            '${note.content.replace(/'/g, "''")}'
          )`
        );
      } catch (ftsError) {
        console.error(`FTS 索引创建失败 (${note.title}):`, ftsError);
      }
      
      successCount++;
      console.log(`✓ 迁移成功: ${note.title}`);
    } catch (error) {
      errorCount++;
      console.error(`✗ 迁移失败 (${note.title}):`, error);
    }
  }
  
  console.log("\n迁移完成！");
  console.log(`成功: ${successCount} 条`);
  console.log(`跳过: ${skipCount} 条`);
  console.log(`失败: ${errorCount} 条`);
}

// 执行迁移
migrateNotesToKnowledge()
  .then(() => {
    console.log("\n所有迁移任务完成");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n迁移过程中发生错误:", error);
    process.exit(1);
  });
