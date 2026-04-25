import { NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/db/init";
import { getDailyTokenUsage, getTokenUsageSummary } from "@/lib/ai/token-tracker";

export async function GET(request: Request) {
  ensureDbInitialized();

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "30", 10);

  // Calculate date range
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const [dailyUsage, summary] = await Promise.all([
    getDailyTokenUsage(startDate, endDate),
    getTokenUsageSummary(),
  ]);

  // Fill in missing dates with zero values
  const usageByDate = new Map(dailyUsage.map((u) => [u.date, u]));
  const filledDailyUsage = [];

  for (let d = new Date(startDate); d <= new Date(endDate); d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    const usage = usageByDate.get(dateStr);
    filledDailyUsage.push({
      date: dateStr,
      promptTokens: usage?.promptTokens || 0,
      completionTokens: usage?.completionTokens || 0,
      totalTokens: usage?.totalTokens || 0,
      requestCount: usage?.requestCount || 0,
    });
  }

  return NextResponse.json({
    summary,
    dailyUsage: filledDailyUsage,
    dateRange: { startDate, endDate },
  });
}
