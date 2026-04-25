export interface FileInfo {
  id: string;
  folderId: string;
  relativePath: string;
  fileName: string;
  extension: string;
  mimeType: string | null;
  sizeBytes: number;
  contentHash: string | null;
  status: FileStatus;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

export type FileStatus = "discovered" | "extracting" | "extracted" | "classified" | "indexed" | "error";

export interface FolderInfo {
  id: string;
  name: string;
  path: string;
  fileCount: number;
  status: FolderStatus;
  createdAt: number;
  updatedAt: number;
}

export type FolderStatus = "pending" | "scanning" | "ready" | "error";

export interface Classification {
  id: string;
  fileId: string;
  primaryCategory: string;
  secondaryCategory: string | null;
  tags: string[];
  confidence: number;
  reasoning: string | null;
}

export interface FileWithClassification extends FileInfo {
  classification?: Classification;
  summary?: string;
}
