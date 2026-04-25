import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { chatSessions, chatMessages, knowledgeEntries, files } from "@/lib/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { chatCompletionStream, chatCompletion } from "@/lib/ai/client";
import { generateEmbedding, deserializeEmbedding, cosineSimilarity } from "@/lib/ai/embeddings";
import { RAG_SYSTEM_PROMPT, QUERY_REWRITE_PROMPT, CHAT_TITLE_PROMPT } from "@/lib/ai/prompts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  ensureDbInitialized();
  const { sessionId } = await params;
  const messages = await db.select().from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt));

  return NextResponse.json(messages.map((m) => ({
    ...m,
    sources: JSON.parse(m.sources || "[]"),
  })));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  ensureDbInitialized();
  const { sessionId } = await params;
  const body = await request.json();
  const userContent = body.content;

  if (!userContent?.trim()) {
    return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
  }

  // Save user message
  const userMsgId = nanoid();
  await db.insert(chatMessages).values({
    id: userMsgId,
    sessionId,
    role: "user",
    content: userContent,
    sources: "[]",
    createdAt: Date.now(),
  });

  // Get conversation history
  const history = await db.select().from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(10);

  // Rewrite query if there's history
  let searchQuery = userContent;
  if (history.length > 2) {
    try {
      const historyText = history.slice(-6).map((m) => `${m.role}: ${m.content.slice(0, 200)}`).join("\n");
      const rewritePrompt = QUERY_REWRITE_PROMPT
        .replace("{history}", historyText)
        .replace("{question}", userContent);
      searchQuery = await chatCompletion([{ role: "user", content: rewritePrompt }], { temperature: 0, maxTokens: 200 });
    } catch {
      searchQuery = userContent;
    }
  }

  // Retrieve relevant chunks
  let sources: { fileId: string; fileName: string; chunkContent: string; score: number }[] = [];
  try {
    const queryEmbedding = await generateEmbedding(searchQuery);
    const allEntries = await db.select().from(knowledgeEntries);

    const scored = allEntries
      .filter((e) => e.embedding)
      .map((entry) => ({
        entry,
        score: cosineSimilarity(queryEmbedding, deserializeEmbedding(entry.embedding as Buffer)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    sources = await Promise.all(
      scored.map(async ({ entry, score }) => {
        let fileName = "";
        if (entry.fileId) {
          const [file] = await db.select({ fileName: files.fileName }).from(files).where(eq(files.id, entry.fileId));
          fileName = file?.fileName || "";
        }
        return {
          fileId: entry.fileId || "",
          fileName,
          chunkContent: entry.content.slice(0, 300),
          score,
        };
      })
    );
  } catch {
    // If embedding fails, continue without sources
  }

  // Build messages for LLM
  const contextBlock = sources.length > 0
    ? "\n\n参考文档内容:\n" + sources.map((s) => `[来源: ${s.fileName}]\n${s.chunkContent}`).join("\n\n")
    : "\n\n（未找到相关文档内容）";

  const llmMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: RAG_SYSTEM_PROMPT + contextBlock },
  ];

  // Add conversation history (limited)
  for (const msg of history.slice(-8)) {
    if (msg.role === "user" || msg.role === "assistant") {
      llmMessages.push({ role: msg.role, content: msg.content.slice(0, 500) });
    }
  }

  // Stream response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send sources first
        controller.enqueue(encoder.encode(`event: sources\ndata: ${JSON.stringify({ sources })}\n\n`));

        const aiStream = await chatCompletionStream(llmMessages);
        let fullContent = "";

        for await (const chunk of aiStream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            fullContent += delta;
            controller.enqueue(encoder.encode(`event: chunk\ndata: ${JSON.stringify({ content: delta })}\n\n`));
          }
        }

        // Save assistant message
        const assistantMsgId = nanoid();
        await db.insert(chatMessages).values({
          id: assistantMsgId,
          sessionId,
          role: "assistant",
          content: fullContent,
          sources: JSON.stringify(sources),
          createdAt: Date.now(),
        });

        // Update session
        await db.update(chatSessions).set({ updatedAt: Date.now() }).where(eq(chatSessions.id, sessionId));

        // Auto-generate title for first message
        if (history.length <= 1) {
          try {
            const titlePrompt = CHAT_TITLE_PROMPT.replace("{message}", userContent);
            const title = await chatCompletion([{ role: "user", content: titlePrompt }], { temperature: 0, maxTokens: 20 });
            await db.update(chatSessions).set({ title: title.trim().slice(0, 20) }).where(eq(chatSessions.id, sessionId));
          } catch {
            // ignore title generation failure
          }
        }

        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ messageId: assistantMsgId })}\n\n`));
        controller.close();
      } catch (error) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: String(error) })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
