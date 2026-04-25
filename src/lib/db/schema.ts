import { sqliteTable, text, integer, real, blob, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// ==========================================
// 原有表: 文件管理 & 知识库 & 图谱
// ==========================================

export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  fileCount: integer("file_count").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending / scanning / ready / error
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  folderId: text("folder_id").notNull().references(() => folders.id, { onDelete: "cascade" }),
  relativePath: text("relative_path").notNull(),
  fileName: text("file_name").notNull(),
  extension: text("extension").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  contentHash: text("content_hash"),
  status: text("status").notNull().default("discovered"), // discovered / extracting / extracted / classified / indexed / error
  errorMessage: text("error_message"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("files_folder_status_idx").on(table.folderId, table.status),
  index("files_folder_updated_idx").on(table.folderId, table.updatedAt),  // 新增：优化文件列表查询
  index("files_extension_idx").on(table.extension),
  index("files_content_hash_idx").on(table.contentHash),
]);

export const fileContents = sqliteTable("file_contents", {
  id: text("id").primaryKey(),
  fileId: text("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  rawText: text("raw_text").notNull().default(""),
  charCount: integer("char_count").notNull().default(0),
  summary: text("summary"),
  language: text("language"),
  extractedAt: integer("extracted_at").notNull(),
}, (table) => [
  uniqueIndex("file_contents_file_id_idx").on(table.fileId),
]);

export const classifications = sqliteTable("classifications", {
  id: text("id").primaryKey(),
  fileId: text("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  primaryCategory: text("primary_category").notNull(),
  secondaryCategory: text("secondary_category"),
  tags: text("tags").notNull().default("[]"), // JSON array
  confidence: real("confidence").notNull().default(0),
  reasoning: text("reasoning"),
  classifiedAt: integer("classified_at").notNull(),
}, (table) => [
  uniqueIndex("classifications_file_id_idx").on(table.fileId),
  index("classifications_category_idx").on(table.primaryCategory),
]);

export const knowledgeEntries = sqliteTable("knowledge_entries", {
  id: text("id").primaryKey(),
  fileId: text("file_id").references(() => files.id, { onDelete: "cascade" }),
  noteId: text("note_id"), // nullable, for indexed notes
  sourceType: text("source_type").notNull().default("file"), // file / note
  chunkIndex: integer("chunk_index").notNull().default(0),
  title: text("title"),
  content: text("content").notNull(),
  embedding: blob("embedding"), // Float32Array serialized
  metadata: text("metadata"), // JSON
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("knowledge_entries_file_idx").on(table.fileId, table.chunkIndex),
  index("knowledge_entries_note_idx").on(table.noteId),
]);

export const graphNodes = sqliteTable("graph_nodes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  entityType: text("entity_type").notNull(), // person / organization / technology / concept / location / event
  description: text("description"),
  properties: text("properties"), // JSON
  mentionCount: integer("mention_count").notNull().default(1),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("graph_nodes_name_type_idx").on(table.name, table.entityType),
  index("graph_nodes_type_idx").on(table.entityType),
]);

export const graphEdges = sqliteTable("graph_edges", {
  id: text("id").primaryKey(),
  sourceNodeId: text("source_node_id").notNull().references(() => graphNodes.id, { onDelete: "cascade" }),
  targetNodeId: text("target_node_id").notNull().references(() => graphNodes.id, { onDelete: "cascade" }),
  relationship: text("relationship").notNull(),
  weight: real("weight").notNull().default(1.0),
  sourceFileId: text("source_file_id").references(() => files.id, { onDelete: "set null" }),
  properties: text("properties"), // JSON
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("graph_edges_source_idx").on(table.sourceNodeId),
  index("graph_edges_target_idx").on(table.targetNodeId),
]);

export const pipelineJobs = sqliteTable("pipeline_jobs", {
  id: text("id").primaryKey(),
  folderId: text("folder_id").notNull().references(() => folders.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(), // scan / extract / classify / index / graph
  status: text("status").notNull().default("pending"), // pending / running / completed / failed
  totalItems: integer("total_items").notNull().default(0),
  processedItems: integer("processed_items").notNull().default(0),
  errorLog: text("error_log"), // JSON array
  startedAt: integer("started_at"),
  completedAt: integer("completed_at"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("pipeline_jobs_folder_idx").on(table.folderId, table.stage),
]);

// ==========================================
// 新增: AI 对话检索
// ==========================================

export const chatSessions = sqliteTable("chat_sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("新对话"),
  folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user / assistant / system
  content: text("content").notNull(),
  sources: text("sources").notNull().default("[]"), // JSON array
  tokenCount: integer("token_count"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("chat_messages_session_idx").on(table.sessionId, table.createdAt),
]);

// ==========================================
// 新增: 文档生成
// ==========================================

export const generatedDocuments = sqliteTable("generated_documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  format: text("format").notNull(), // pptx / docx / markdown
  docType: text("doc_type").notNull(), // report / summary / presentation / analysis
  content: text("content").notNull().default(""), // generated Markdown
  filePath: text("file_path"),
  fileSize: integer("file_size"),
  sourceFileIds: text("source_file_ids").notNull().default("[]"), // JSON array
  sourceSessionId: text("source_session_id"),
  status: text("status").notNull().default("generating"), // generating / ready / failed
  error: text("error"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("generated_docs_status_idx").on(table.status),
]);

// ==========================================
// 新增: Markdown 笔记
// ==========================================

export const noteFolders = sqliteTable("note_folders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("note_folders_parent_idx").on(table.parentId),
]);

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("无标题笔记"),
  content: text("content").notNull().default(""),
  excerpt: text("excerpt").notNull().default(""),
  folderId: text("folder_id").references(() => noteFolders.id, { onDelete: "set null" }),
  isPinned: integer("is_pinned").notNull().default(0),
  isIndexed: integer("is_indexed").notNull().default(0),
  wordCount: integer("word_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("notes_folder_idx").on(table.folderId),
  index("notes_updated_idx").on(table.updatedAt),
  index("notes_pinned_idx").on(table.isPinned),
]);

export const noteTags = sqliteTable("note_tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color"),
  createdAt: integer("created_at").notNull(),
});

export const noteTagRelations = sqliteTable("note_tag_relations", {
  noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  tagId: text("tag_id").notNull().references(() => noteTags.id, { onDelete: "cascade" }),
}, (table) => [
  index("note_tag_note_idx").on(table.noteId),
  index("note_tag_tag_idx").on(table.tagId),
]);

// ==========================================
// Token Usage Tracking
// ==========================================

export const tokenUsage = sqliteTable("token_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD format
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  requestCount: integer("request_count").notNull().default(1),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("token_usage_date_idx").on(table.date),
  index("token_usage_model_idx").on(table.model),
]);

// ==========================================
// 提取缓存表 (方案1：文本提取缓存机制)
// ==========================================

export const extractionCache = sqliteTable("extraction_cache", {
  id: text("id").primaryKey(),
  contentHash: text("content_hash").notNull(), // 文件内容hash
  fileName: text("file_name").notNull(),
  extension: text("extension").notNull(),
  rawText: text("raw_text").notNull().default(""),
  charCount: integer("char_count").notNull().default(0),
  metadata: text("metadata"), // JSON: {originalType, pageCount, etc.}
  extractedAt: integer("extracted_at").notNull(),
  accessCount: integer("access_count").notNull().default(1), // 访问次数
  lastAccessedAt: integer("last_accessed_at").notNull(),
}, (table) => [
  uniqueIndex("extraction_cache_hash_idx").on(table.contentHash),
  index("extraction_cache_extension_idx").on(table.extension),
  index("extraction_cache_accessed_idx").on(table.lastAccessedAt),
]);
