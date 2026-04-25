export interface ChatSession {
  id: string;
  title: string;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
  lastMessage?: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: ChatSource[];
  tokenCount: number | null;
  createdAt: number;
}

export interface ChatSource {
  fileId: string;
  fileName: string;
  chunkContent: string;
  score: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  folderId: string | null;
  isPinned: boolean;
  isIndexed: boolean;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
  tags?: NoteTag[];
}

export interface NoteFolder {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: number;
  children?: NoteFolder[];
}

export interface NoteTag {
  id: string;
  name: string;
  color: string | null;
  noteCount?: number;
}

export interface GeneratedDocument {
  id: string;
  title: string;
  format: "pptx" | "docx" | "markdown";
  docType: "report" | "summary" | "presentation" | "analysis";
  content: string;
  filePath: string | null;
  fileSize: number | null;
  sourceFileIds: string[];
  sourceSessionId: string | null;
  status: "generating" | "ready" | "failed";
  error: string | null;
  createdAt: number;
}
