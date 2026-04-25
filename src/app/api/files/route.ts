import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { files, classifications } from "@/lib/db/schema";
import { eq, and, like, desc, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  ensureDbInitialized();
  const queryStartTime = Date.now();
  
  const searchParams = request.nextUrl.searchParams;
  const folderId = searchParams.get("folderId");
  const category = searchParams.get("category");
  const status = searchParams.get("status");
  const q = searchParams.get("q");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "100");
  const offset = (page - 1) * limit;

  console.log(`[Files API] Query params: folderId=${folderId}, page=${page}, limit=${limit}`);

  let query = db.select().from(files);
  const conditions = [];

  if (folderId) conditions.push(eq(files.folderId, folderId));
  if (status) conditions.push(eq(files.status, status));
  if (q) conditions.push(like(files.fileName, `%${q}%`));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  // 使用 LIMIT 1 快速检查是否有数据，避免全表扫描
  let totalCount = 0;
  let hasAnyData = false;
  const sampleStartTime = Date.now();
  try {
    // 只查1条记录来判断是否有数据（非常快）
    const sampleQuery = db.select({ id: files.id }).from(files);
    if (conditions.length > 0) {
      (sampleQuery as any).where = and(...conditions);
    }
    const sampleResult = await sampleQuery.limit(1);
    hasAnyData = sampleResult.length > 0;
    const sampleTime = Date.now() - sampleStartTime;
    console.log(`[Files API] Sample query: ${sampleTime}ms, hasData=${hasAnyData}`);
    
    // 如果有数据，估算总数（基于第一页数据）
    // 这样避免慢速的全表count
    if (hasAnyData) {
      // 先假设至少有limit条，后续根据hasMore调整
      totalCount = limit;
    }
  } catch (e) {
    console.error('Sample query failed:', e);
  }

  // 只查询当前页数据，多查一条判断是否有更多
  const mainQueryStartTime = Date.now();
  const result = await query
    .orderBy(desc(files.updatedAt))
    .limit(limit + 1)  // 多查1条判断hasMore
    .offset(offset);
  const mainQueryTime = Date.now() - mainQueryStartTime;
  console.log(`[Files API] Main query: ${mainQueryTime}ms, resultCount=${result.length}`);

  const hasMore = result.length > limit;
  const pageResult = hasMore ? result.slice(0, limit) : result;
  
  // 估算总数：已加载的 + 如果hasMore则再加limit
  const estimatedTotal = hasAnyData 
    ? (offset + pageResult.length + (hasMore ? limit : 0))
    : 0;

  const totalTime = Date.now() - queryStartTime;
  console.log(`[Files API] Total query time: ${totalTime}ms`);

  // If filtering by category, join with classifications
  if (category) {
    const classifiedFiles = await db
      .select()
      .from(files)
      .innerJoin(classifications, eq(files.id, classifications.fileId))
      .where(
        and(
          ...(folderId ? [eq(files.folderId, folderId)] : []),
          eq(classifications.primaryCategory, category)
        )
      )
      .limit(limit + 1)
      .offset(offset);
    
    const classifiedHasMore = classifiedFiles.length > limit;
    const classifiedResult = classifiedHasMore ? classifiedFiles.slice(0, limit) : classifiedFiles;
    
    return NextResponse.json({
      files: classifiedResult.map((r) => ({ ...r.files, classification: r.classifications })),
      hasMore: classifiedHasMore,
      page,
      limit,
    });
  }

  return NextResponse.json({
    files: pageResult,
    total: estimatedTotal,
    hasMore,
    page,
    limit,
  });
}
