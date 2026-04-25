import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { generatedDocuments } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  ensureDbInitialized();
  const params = request.nextUrl.searchParams;
  const limit = parseInt(params.get("limit") || "50");

  const docs = await db
    .select()
    .from(generatedDocuments)
    .orderBy(desc(generatedDocuments.createdAt))
    .limit(limit);

  return NextResponse.json(docs);
}
