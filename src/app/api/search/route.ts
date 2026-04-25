import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { knowledgeEntries, files } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sqlite } from "@/lib/db";
import { generateEmbedding, deserializeEmbedding, cosineSimilarity } from "@/lib/ai/embeddings";

export async function GET(request: NextRequest) {
  ensureDbInitialized();
  const params = request.nextUrl.searchParams;
  const q = params.get("q") || "";
  const mode = params.get("mode") || "fts";
  const limit = parseInt(params.get("limit") || "20");

  if (!q.trim()) {
    return NextResponse.json([]);
  }

  if (mode === "semantic") {
    try {
      const queryEmbedding = await generateEmbedding(q);
      const allEntries = await db.select().from(knowledgeEntries);

      const scored = allEntries
        .filter((e) => e.embedding)
        .map((entry) => {
          const entryEmbedding = deserializeEmbedding(entry.embedding as Buffer);
          const score = cosineSimilarity(queryEmbedding, entryEmbedding);
          return { entry, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      // Enrich with file names
      const results = await Promise.all(
        scored.map(async ({ entry, score }) => {
          let fileName = "";
          if (entry.fileId) {
            const [file] = await db.select({ fileName: files.fileName }).from(files).where(eq(files.id, entry.fileId));
            fileName = file?.fileName || "";
          }
          return { ...entry, embedding: undefined, score, fileName };
        })
      );

      return NextResponse.json(results);
    } catch (error) {
      return NextResponse.json({ error: String(error) }, { status: 500 });
    }
  }

  // FTS mode
  try {
    const ftsResults = sqlite.prepare(
      `SELECT rowid, rank FROM knowledge_fts WHERE knowledge_fts MATCH ? ORDER BY rank LIMIT ?`
    ).all(q, limit) as { rowid: number; rank: number }[];

    if (ftsResults.length === 0) {
      return NextResponse.json([]);
    }

    const allEntries = await db.select().from(knowledgeEntries);
    const allEntriesWithRowid = sqlite.prepare(
      `SELECT id, rowid FROM knowledge_entries`
    ).all() as { id: string; rowid: number }[];

    const rowidToId = new Map(allEntriesWithRowid.map((r) => [r.rowid, r.id]));

    const results = await Promise.all(
      ftsResults.map(async (fts) => {
        const entryId = rowidToId.get(fts.rowid);
        const entry = allEntries.find((e) => e.id === entryId);
        if (!entry) return null;

        let fileName = "";
        if (entry.fileId) {
          const [file] = await db.select({ fileName: files.fileName }).from(files).where(eq(files.id, entry.fileId));
          fileName = file?.fileName || "";
        }
        return { ...entry, embedding: undefined, score: -fts.rank, fileName };
      })
    );

    return NextResponse.json(results.filter(Boolean));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
