import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { chatSessions, chatMessages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  ensureDbInitialized();
  const { sessionId } = await params;

  // Delete all messages first (cascade)
  await db.delete(chatMessages).where(eq(chatMessages.sessionId, sessionId));
  
  // Delete the session
  await db.delete(chatSessions).where(eq(chatSessions.id, sessionId));

  return NextResponse.json({ success: true });
}
