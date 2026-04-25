import { db } from "@/lib/db";
import { pipelineJobs, folders } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Pipeline Task Lock Manager
 * 
 * Ensures only one pipeline task runs at a time across all folders.
 * Uses database-level locking for persistence across server restarts.
 */

interface LockInfo {
  isLocked: boolean;
  currentJob: {
    id: string;
    folderId: string;
    stage: string;
    startedAt: number | null;
  } | null;
}

/**
 * Check if there's any running pipeline job
 */
export async function getPipelineLock(): Promise<LockInfo> {
  const runningJobs = await db
    .select({
      id: pipelineJobs.id,
      folderId: pipelineJobs.folderId,
      stage: pipelineJobs.stage,
      startedAt: pipelineJobs.startedAt,
    })
    .from(pipelineJobs)
    .where(eq(pipelineJobs.status, "running"))
    .limit(1);

  if (runningJobs.length === 0) {
    return { isLocked: false, currentJob: null };
  }

  return {
    isLocked: true,
    currentJob: runningJobs[0],
  };
}

/**
 * Try to acquire lock for a new pipeline job
 * Returns true if lock acquired, false if already locked
 */
export async function tryAcquireLock(folderId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const lock = await getPipelineLock();

  if (lock.isLocked) {
    const folder = await db
      .select({ name: folders.name })
      .from(folders)
      .where(eq(folders.id, lock.currentJob!.folderId))
      .limit(1);

    const folderName = folder[0]?.name || "未知文件夹";
    
    return {
      success: false,
      error: `已有任务正在处理中 (${folderName} - ${lock.currentJob!.stage} 阶段),请等待完成后再试`,
    };
  }

  return { success: true };
}

/**
 * Release lock by marking all running jobs as failed
 * This is a safety mechanism for orphaned locks
 */
export async function releaseStaleLock(timeoutMs: number = 30 * 60 * 1000): Promise<void> {
  const timeout = Date.now() - timeoutMs;

  // Find jobs that have been running for too long (likely orphaned)
  const staleJobs = await db
    .select({ id: pipelineJobs.id, startedAt: pipelineJobs.startedAt })
    .from(pipelineJobs)
    .where(eq(pipelineJobs.status, "running"));

  // Filter in JavaScript for better type safety
  const timedOutJobs = staleJobs.filter(
    (job) => job.startedAt && job.startedAt < timeout
  );

  if (timedOutJobs.length > 0) {
    console.warn(`[PipelineLock] Releasing ${timedOutJobs.length} stale lock(s)`);
    
    for (const job of timedOutJobs) {
      await db
        .update(pipelineJobs)
        .set({
          status: "failed",
          errorLog: JSON.stringify([{
            error: "任务超时,自动释放锁",
            timestamp: Date.now(),
          }]),
          completedAt: Date.now(),
        })
        .where(eq(pipelineJobs.id, job.id));
    }
  }
}

/**
 * Get lock status with folder name for UI display
 */
export async function getLockStatus() {
  const lock = await getPipelineLock();

  if (!lock.isLocked) {
    return { isLocked: false };
  }

  const folder = await db
    .select({ name: folders.name })
    .from(folders)
    .where(eq(folders.id, lock.currentJob!.folderId))
    .limit(1);

  return {
    isLocked: true,
    folderName: folder[0]?.name || "未知文件夹",
    stage: lock.currentJob!.stage,
    startedAt: lock.currentJob!.startedAt,
  };
}
