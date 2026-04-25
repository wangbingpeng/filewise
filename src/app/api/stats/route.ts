import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { folders, files, knowledgeEntries, graphNodes, chatSessions, notes, generatedDocuments } from "@/lib/db/schema";
import { count } from "drizzle-orm";

export async function GET() {
  ensureDbInitialized();

  const [foldersCount] = await db.select({ count: count() }).from(folders);
  const [filesCount] = await db.select({ count: count() }).from(files);
  const [keCount] = await db.select({ count: count() }).from(knowledgeEntries);
  const [gnCount] = await db.select({ count: count() }).from(graphNodes);
  const [csCount] = await db.select({ count: count() }).from(chatSessions);
  const [notesCount] = await db.select({ count: count() }).from(notes);
  const [gdCount] = await db.select({ count: count() }).from(generatedDocuments);

  return NextResponse.json({
    folders: foldersCount.count,
    files: filesCount.count,
    knowledgeEntries: keCount.count,
    graphNodes: gnCount.count,
    chatSessions: csCount.count,
    notes: notesCount.count,
    generatedDocs: gdCount.count,
  });
}
