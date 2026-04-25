import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { pipelineJobs } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * Get pipeline job progress for a folder
 * Query: ?folderId=xxx
 */
export async function GET(request: Request) {
  ensureDbInitialized();
  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId");

  if (!folderId) {
    return NextResponse.json({ error: "folderId 不能为空" }, { status: 400 });
  }

  // Get the latest job for this folder
  const jobs = await db
    .select()
    .from(pipelineJobs)
    .where(eq(pipelineJobs.folderId, folderId))
    .orderBy(desc(pipelineJobs.createdAt))
    .limit(5);

  // Calculate overall progress
  const latestJob = jobs[0];
  let overallProgress = {
    currentStage: "idle",
    totalStages: 5,
    completedStages: 0,
    currentJob: null as typeof latestJob | null,
    isRunning: false,
    estimatedTimeRemaining: null as number | null, // seconds
    stages: [] as Array<{
      stage: string;
      status: string;
      totalItems: number;
      processedItems: number;
      progress: number;
      estimatedTimeRemaining?: number | null; // seconds for this stage
      _actualAvgTime?: number; // Internal: average time per item in ms
    }>,
  };

  const stages = ["scan", "extract", "classify", "index", "graph"];
  const stageNames: Record<string, string> = {
    scan: "扫描文件",
    extract: "提取内容",
    classify: "智能分类",
    index: "向量索引",
    graph: "知识图谱",
  };

  // Average time per item for each stage (in milliseconds) - based on historical data
  const stageAverageTime: Record<string, number> = {
    scan: 50,      // 50ms per file (fast I/O)
    extract: 500,  // 500ms per file (I/O + parsing)
    classify: 2000, // 2s per file (AI call)
    index: 1500,   // 1.5s per file (embedding generation)
    graph: 2000,   // 2s per file (AI call)
  };

  // Check completed stages by counting files with each status
  for (const stage of stages) {
    const job = jobs.find((j) => j.stage === stage && j.status === "completed");
    
    // Calculate actual average time from completed job
    let actualAvgTime = stageAverageTime[stage];
    if (job && job.startedAt && job.completedAt) {
      const duration = job.completedAt - job.startedAt;
      if (job.totalItems > 0) {
        actualAvgTime = duration / job.totalItems;
      }
    }
    
    overallProgress.stages.push({
      stage,
      status: job ? "completed" : "pending",
      totalItems: job?.totalItems || 0,
      processedItems: job?.processedItems || 0,
      progress: job ? Math.round((job.processedItems / job.totalItems) * 100) : 0,
      estimatedTimeRemaining: null,
      _actualAvgTime: actualAvgTime, // Store for later calculation
    });
  }

  // If there's a running job
  const runningJob = jobs.find((j) => j.status === "running");
  if (runningJob) {
    overallProgress.isRunning = true;
    overallProgress.currentStage = runningJob.stage;
    overallProgress.currentJob = runningJob;

    // Update the running stage in stages array
    const stageIndex = stages.indexOf(runningJob.stage);
    if (stageIndex !== -1) {
      const stageData = overallProgress.stages[stageIndex];
      const avgTime = (stageData as any)._actualAvgTime || stageAverageTime[runningJob.stage];
      
      // Calculate remaining time for current stage
      const remainingItems = runningJob.totalItems - runningJob.processedItems;
      const currentStageRemainingTime = remainingItems > 0 
        ? Math.ceil((remainingItems * avgTime) / 1000) // Convert to seconds
        : 0;
      
      // Calculate total remaining time (current stage + all pending stages)
      let totalRemainingTime = currentStageRemainingTime;
      
      // Add estimated time for pending stages
      for (let i = stageIndex + 1; i < stages.length; i++) {
        const pendingStage = overallProgress.stages[i];
        const pendingAvgTime = (pendingStage as any)._actualAvgTime || stageAverageTime[stages[i]];
        const pendingItems = pendingStage.totalItems || runningJob.totalItems; // Use current job's total as estimate
        totalRemainingTime += Math.ceil((pendingItems * pendingAvgTime) / 1000);
      }
      
      overallProgress.estimatedTimeRemaining = totalRemainingTime;
      
      overallProgress.stages[stageIndex] = {
        stage: runningJob.stage,
        status: "running",
        totalItems: runningJob.totalItems,
        processedItems: runningJob.processedItems,
        progress: runningJob.totalItems > 0
          ? Math.round((runningJob.processedItems / runningJob.totalItems) * 100)
          : 0,
        estimatedTimeRemaining: currentStageRemainingTime,
      };
    }

    // Count completed stages
    overallProgress.completedStages = stages.slice(0, stageIndex).length;
  } else {
    // No running job, count completed stages
    overallProgress.completedStages = overallProgress.stages.filter(
      (s) => s.status === "completed"
    ).length;
  }
  
  // Remove internal _actualAvgTime field before returning
  overallProgress.stages = overallProgress.stages.map(({ _actualAvgTime, ...stage }) => stage);

  return NextResponse.json({
    success: true,
    progress: overallProgress,
    jobs: jobs.slice(0, 3), // Return last 3 jobs for reference
  });
}
