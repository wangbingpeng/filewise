import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { chatSessions, chatMessages } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET() {
  ensureDbInitialized();
  const sessions = await db.select().from(chatSessions).orderBy(desc(chatSessions.updatedAt));

  // Get last message for each session
  const result = await Promise.all(
    sessions.map(async (session) => {
      const [lastMsg] = await db.select({ content: chatMessages.content })
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, session.id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);
      return { ...session, lastMessage: lastMsg?.content?.slice(0, 50) || "" };
    })
  );

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  ensureDbInitialized();
  const body = await request.json();
  const now = Date.now();
  const id = nanoid();

  await db.insert(chatSessions).values({
    id,
    title: body.title || "新对话",
    folderId: body.folderId || null,
    createdAt: now,
    updatedAt: now,
  });

  const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, id));
  return NextResponse.json(session, { status: 201 });
}
