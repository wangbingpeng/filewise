import { db } from "@/lib/db";
import { tokenUsage } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * Record token usage for a model call
 */
export async function recordTokenUsage(
  model: string,
  promptTokens: number,
  completionTokens: number
): Promise<void> {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const now = Date.now();

  try {
    // Try to find existing record for today and model
    const existing = await db
      .select()
      .from(tokenUsage)
      .where(and(eq(tokenUsage.date, today), eq(tokenUsage.model, model)))
      .limit(1);

    if (existing.length > 0) {
      // Update existing record
      await db
        .update(tokenUsage)
        .set({
          promptTokens: sql`${tokenUsage.promptTokens} + ${promptTokens}`,
          completionTokens: sql`${tokenUsage.completionTokens} + ${completionTokens}`,
          totalTokens: sql`${tokenUsage.totalTokens} + ${promptTokens + completionTokens}`,
          requestCount: sql`${tokenUsage.requestCount} + 1`,
        })
        .where(eq(tokenUsage.id, existing[0].id));
    } else {
      // Create new record
      await db.insert(tokenUsage).values({
        date: today,
        model,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        requestCount: 1,
        createdAt: now,
      });
    }
  } catch (error) {
    console.error("Failed to record token usage:", error);
  }
}

/**
 * Get token usage for a date range
 */
export async function getTokenUsage(
  startDate: string,
  endDate: string
): Promise<
  Array<{
    date: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    requestCount: number;
  }>
> {
  const results = await db
    .select()
    .from(tokenUsage)
    .where(
      and(
        sql`${tokenUsage.date} >= ${startDate}`,
        sql`${tokenUsage.date} <= ${endDate}`
      )
    );

  return results.map((r) => ({
    date: r.date,
    model: r.model,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    totalTokens: r.totalTokens,
    requestCount: r.requestCount,
  }));
}

/**
 * Get daily aggregated token usage
 */
export async function getDailyTokenUsage(
  startDate: string,
  endDate: string
): Promise<
  Array<{
    date: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    requestCount: number;
  }>
> {
  const results = await db
    .select({
      date: tokenUsage.date,
      promptTokens: sql<number>`SUM(${tokenUsage.promptTokens})`.as("promptTokens"),
      completionTokens: sql<number>`SUM(${tokenUsage.completionTokens})`.as("completionTokens"),
      totalTokens: sql<number>`SUM(${tokenUsage.totalTokens})`.as("totalTokens"),
      requestCount: sql<number>`SUM(${tokenUsage.requestCount})`.as("requestCount"),
    })
    .from(tokenUsage)
    .where(
      and(
        sql`${tokenUsage.date} >= ${startDate}`,
        sql`${tokenUsage.date} <= ${endDate}`
      )
    )
    .groupBy(tokenUsage.date)
    .orderBy(tokenUsage.date);

  return results;
}

/**
 * Get total token usage summary
 */
export async function getTokenUsageSummary(): Promise<{
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalRequests: number;
}> {
  const results = await db
    .select({
      totalPromptTokens: sql<number>`COALESCE(SUM(${tokenUsage.promptTokens}), 0)`.as("totalPromptTokens"),
      totalCompletionTokens: sql<number>`COALESCE(SUM(${tokenUsage.completionTokens}), 0)`.as("totalCompletionTokens"),
      totalTokens: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)`.as("totalTokens"),
      totalRequests: sql<number>`COALESCE(SUM(${tokenUsage.requestCount}), 0)`.as("totalRequests"),
    })
    .from(tokenUsage);

  return results[0] || {
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    totalRequests: 0,
  };
}
