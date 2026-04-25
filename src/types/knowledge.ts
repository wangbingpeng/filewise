export interface KnowledgeEntry {
  id: string;
  fileId: string | null;
  noteId: string | null;
  sourceType: "file" | "note";
  chunkIndex: number;
  title: string | null;
  content: string;
  metadata: string | null;
  createdAt: number;
}

export interface SearchResult {
  entry: KnowledgeEntry;
  score: number;
  fileName?: string;
  noteTitle?: string;
}

export type SearchMode = "fts" | "semantic";
