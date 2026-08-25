import pg from "pg";
import type { CodeChunk } from "../chunker/types.js";
import {
  EMBEDDING_DIMENSION,
  embedQuery,
  embedTexts,
} from "../embeddings/client.js";
import { SCHEMA_SQL } from "./schema.js";

const { Pool } = pg;

export type SimilarChunk = CodeChunk & {
  similarity: number;
};

export function chunkEmbeddingText(chunk: CodeChunk): string {
  const header = [
    `file: ${chunk.filePath}`,
    `symbol: ${chunk.symbol}`,
    chunk.className ? `class: ${chunk.className}` : null,
    `kind: ${chunk.kind}`,
    `lines: ${chunk.startLine}-${chunk.endLine}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `${header}\n\n${chunk.code}`;
}

export function toPgVector(values: number[]): string {
  if (values.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `expected ${EMBEDDING_DIMENSION} dimensions, got ${values.length}`,
    );
  }
  return `[${values.join(",")}]`;
}

function rowToChunk(row: {
  id: string;
  file_path: string;
  symbol: string;
  class_name: string | null;
  kind: CodeChunk["kind"];
  start_line: number;
  end_line: number;
  code: string;
  similarity: string | number;
}): SimilarChunk {
  return {
    id: row.id,
    filePath: row.file_path,
    symbol: row.symbol,
    className: row.class_name ?? undefined,
    kind: row.kind,
    startLine: row.start_line,
    endLine: row.end_line,
    code: row.code,
    similarity: Number(row.similarity),
  };
}

export class ChunkVectorStore {
  private readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  static connect(connectionString = process.env.DATABASE_URL): ChunkVectorStore {
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    return new ChunkVectorStore(new Pool({ connectionString }));
  }

  async migrate(): Promise<void> {
    await this.pool.query(SCHEMA_SQL);
  }

  async upsertChunks(chunks: CodeChunk[]): Promise<number> {
    if (chunks.length === 0) return 0;

    const texts = chunks.map(chunkEmbeddingText);
    const vectors = await embedTexts(texts);
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      for (const [index, chunk] of chunks.entries()) {
        const vector = vectors[index];
        if (!vector) {
          throw new Error(`missing embedding for chunk ${chunk.id}`);
        }

        await client.query(
          `INSERT INTO code_chunks (
            id, file_path, symbol, class_name, kind, start_line, end_line, code, embedding
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector)
          ON CONFLICT (id) DO UPDATE SET
            file_path = EXCLUDED.file_path,
            symbol = EXCLUDED.symbol,
            class_name = EXCLUDED.class_name,
            kind = EXCLUDED.kind,
            start_line = EXCLUDED.start_line,
            end_line = EXCLUDED.end_line,
            code = EXCLUDED.code,
            embedding = EXCLUDED.embedding`,
          [
            chunk.id,
            chunk.filePath,
            chunk.symbol,
            chunk.className ?? null,
            chunk.kind,
            chunk.startLine,
            chunk.endLine,
            chunk.code,
            toPgVector(vector),
          ],
        );
      }

      await client.query("COMMIT");
      return chunks.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async searchSimilar(query: string, topK: number): Promise<SimilarChunk[]> {
    if (topK < 1) {
      throw new Error("topK must be at least 1");
    }

    const queryVector = await embedQuery(query);
    const { rows } = await this.pool.query(
      `SELECT
        id,
        file_path,
        symbol,
        class_name,
        kind,
        start_line,
        end_line,
        code,
        1 - (embedding <=> $1::vector) AS similarity
      FROM code_chunks
      ORDER BY embedding <=> $1::vector
      LIMIT $2`,
      [toPgVector(queryVector), topK],
    );

    return rows.map(rowToChunk);
  }

  async count(): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM code_chunks",
    );
    return Number(rows[0]?.count ?? 0);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
