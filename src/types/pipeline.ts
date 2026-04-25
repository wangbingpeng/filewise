export type PipelineStage = "scan" | "extract" | "classify" | "index" | "graph";
export type PipelineStatus = "pending" | "running" | "completed" | "failed";

export interface PipelineJob {
  id: string;
  folderId: string;
  stage: PipelineStage;
  status: PipelineStatus;
  totalItems: number;
  processedItems: number;
  errorLog: string | null;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
}

export interface PipelineProgress {
  stage: PipelineStage;
  status: PipelineStatus;
  processed: number;
  total: number;
  currentFile?: string;
  error?: string;
}

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  scan: "扫描文件",
  extract: "提取内容",
  classify: "AI 分类",
  index: "知识索引",
  graph: "图谱抽取",
};
