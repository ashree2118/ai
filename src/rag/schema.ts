export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS code_chunks (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  symbol TEXT NOT NULL,
  class_name TEXT,
  kind TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  code TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS code_chunks_embedding_hnsw_idx
  ON code_chunks
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS agent_episodes (
  id TEXT PRIMARY KEY,
  issue_type TEXT NOT NULL,
  issue_text TEXT NOT NULL,
  files_changed TEXT[] NOT NULL DEFAULT '{}',
  approach TEXT NOT NULL,
  what_worked TEXT NOT NULL,
  what_failed TEXT NOT NULL,
  result TEXT NOT NULL,
  completed BOOLEAN NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_episodes_embedding_hnsw_idx
  ON agent_episodes
  USING hnsw (embedding vector_cosine_ops);
`.trim();
