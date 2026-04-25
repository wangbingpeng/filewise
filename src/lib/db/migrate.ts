import { sqlite } from "./index";

export function runMigrations() {
  // Create all tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      file_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
      relative_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      extension TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT,
      status TEXT NOT NULL DEFAULT 'discovered',
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS files_folder_status_idx ON files(folder_id, status);
    CREATE INDEX IF NOT EXISTS files_folder_updated_idx ON files(folder_id, updated_at);
    CREATE INDEX IF NOT EXISTS files_extension_idx ON files(extension);
    CREATE INDEX IF NOT EXISTS files_content_hash_idx ON files(content_hash);

    CREATE TABLE IF NOT EXISTS file_contents (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      raw_text TEXT NOT NULL DEFAULT '',
      char_count INTEGER NOT NULL DEFAULT 0,
      summary TEXT,
      language TEXT,
      extracted_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS file_contents_file_id_idx ON file_contents(file_id);

    CREATE TABLE IF NOT EXISTS classifications (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      primary_category TEXT NOT NULL,
      secondary_category TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      confidence REAL NOT NULL DEFAULT 0,
      reasoning TEXT,
      classified_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS classifications_file_id_idx ON classifications(file_id);
    CREATE INDEX IF NOT EXISTS classifications_category_idx ON classifications(primary_category);

    CREATE TABLE IF NOT EXISTS knowledge_entries (
      id TEXT PRIMARY KEY,
      file_id TEXT REFERENCES files(id) ON DELETE CASCADE,
      note_id TEXT,
      source_type TEXT NOT NULL DEFAULT 'file',
      chunk_index INTEGER NOT NULL DEFAULT 0,
      title TEXT,
      content TEXT NOT NULL,
      embedding BLOB,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS knowledge_entries_file_idx ON knowledge_entries(file_id, chunk_index);
    CREATE INDEX IF NOT EXISTS knowledge_entries_note_idx ON knowledge_entries(note_id);

    CREATE TABLE IF NOT EXISTS graph_nodes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      description TEXT,
      properties TEXT,
      mention_count INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS graph_nodes_name_type_idx ON graph_nodes(name, entity_type);
    CREATE INDEX IF NOT EXISTS graph_nodes_type_idx ON graph_nodes(entity_type);

    CREATE TABLE IF NOT EXISTS graph_edges (
      id TEXT PRIMARY KEY,
      source_node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
      target_node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
      relationship TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1.0,
      source_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
      properties TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS graph_edges_source_idx ON graph_edges(source_node_id);
    CREATE INDEX IF NOT EXISTS graph_edges_target_idx ON graph_edges(target_node_id);

    CREATE TABLE IF NOT EXISTS pipeline_jobs (
      id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total_items INTEGER NOT NULL DEFAULT 0,
      processed_items INTEGER NOT NULL DEFAULT 0,
      error_log TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pipeline_jobs_folder_idx ON pipeline_jobs(folder_id, stage);

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '新对话',
      folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sources TEXT NOT NULL DEFAULT '[]',
      token_count INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages(session_id, created_at);

    CREATE TABLE IF NOT EXISTS generated_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      format TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      file_path TEXT,
      file_size INTEGER,
      source_file_ids TEXT NOT NULL DEFAULT '[]',
      source_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'generating',
      error TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS generated_docs_status_idx ON generated_documents(status);

    CREATE TABLE IF NOT EXISTS note_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS note_folders_parent_idx ON note_folders(parent_id);

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '无标题笔记',
      content TEXT NOT NULL DEFAULT '',
      excerpt TEXT NOT NULL DEFAULT '',
      folder_id TEXT REFERENCES note_folders(id) ON DELETE SET NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_indexed INTEGER NOT NULL DEFAULT 0,
      word_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS notes_folder_idx ON notes(folder_id);
    CREATE INDEX IF NOT EXISTS notes_updated_idx ON notes(updated_at);
    CREATE INDEX IF NOT EXISTS notes_pinned_idx ON notes(is_pinned);

    CREATE TABLE IF NOT EXISTS note_tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS note_tag_relations (
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES note_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (note_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS note_tag_note_idx ON note_tag_relations(note_id);
    CREATE INDEX IF NOT EXISTS note_tag_tag_idx ON note_tag_relations(tag_id);
  `);

  // Create FTS5 virtual tables (these use IF NOT EXISTS implicitly in newer SQLite)
  try {
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
        title, content, tokenize='unicode61'
      );
    `);
  } catch {
    // Table might already exist
  }

  try {
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
        title, content, tokenize='unicode61'
      );
    `);
  } catch {
    // Table might already exist
  }
}
