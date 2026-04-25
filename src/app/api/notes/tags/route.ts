import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { noteTags, noteTagRelations } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET() {
  ensureDbInitialized();
  const tags = await db.select().from(noteTags).orderBy(noteTags.name);

  // Attach note count
  const enriched = await Promise.all(
    tags.map(async (tag) => {
      const [count] = await db
        .select({ count: sql<number>`count(*)` })
        .from(noteTagRelations)
        .where(eq(noteTagRelations.tagId, tag.id));
      return { ...tag, noteCount: count?.count || 0 };
    })
  );

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  ensureDbInitialized();
  const body = await request.json();
  const id = nanoid();
  const now = Date.now();

  await db.insert(noteTags).values({
    id,
    name: body.name,
    color: body.color || null,
    createdAt: now,
  });

  const [tag] = await db.select().from(noteTags).where(eq(noteTags.id, id));
  return NextResponse.json(tag, { status: 201 });
}
