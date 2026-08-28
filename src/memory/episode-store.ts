import { randomUUID } from "node:crypto";
import pg from "pg";
import { embedQuery } from "../embeddings/client.js";
import { SCHEMA_SQL } from "../rag/schema.js";
import { toPgVector } from "../rag/store.js";
import type { EpisodeInput, SimilarEpisode } from "./episodes.js";
import { episodeEmbeddingText } from "./episodes.js";

const { Pool } = pg;

function rowToEpisode(row: {
  id: string;
  issue_type: SimilarEpisode["issueType"];
  issue_text: string;
  files_changed: string[];
  approach: string;
  what_worked: string;
  what_failed: string;
  result: string;
  completed: boolean;
  similarity: string | number;
}): SimilarEpisode {
  return {
    id: row.id,
    issueType: row.issue_type,
    issueText: row.issue_text,
    filesChanged: row.files_changed ?? [],
    approach: row.approach,
    whatWorked: row.what_worked,
    whatFailed: row.what_failed,
    result: row.result,
    completed: row.completed,
    similarity: Number(row.similarity),
  };
}

export class EpisodeVectorStore {
  private readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  static connect(
    connectionString = process.env.DATABASE_URL,
  ): EpisodeVectorStore {
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    return new EpisodeVectorStore(new Pool({ connectionString }));
  }

  async migrate(): Promise<void> {
    await this.pool.query(SCHEMA_SQL);
  }

  async saveEpisode(episode: EpisodeInput, id = randomUUID()): Promise<string> {
    const vector = await embedQuery(episodeEmbeddingText(episode));
    await this.pool.query(
      `INSERT INTO agent_episodes (
        id, issue_type, issue_text, files_changed, approach,
        what_worked, what_failed, result, completed, embedding
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector)`,
      [
        id,
        episode.issueType,
        episode.issueText,
        episode.filesChanged,
        episode.approach,
        episode.whatWorked,
        episode.whatFailed,
        episode.result,
        episode.completed,
        toPgVector(vector),
      ],
    );
    return id;
  }

  async searchSimilar(query: string, topK: number): Promise<SimilarEpisode[]> {
    if (topK < 1) {
      throw new Error("topK must be at least 1");
    }

    const queryVector = await embedQuery(query);
    const { rows } = await this.pool.query(
      `SELECT
        id,
        issue_type,
        issue_text,
        files_changed,
        approach,
        what_worked,
        what_failed,
        result,
        completed,
        1 - (embedding <=> $1::vector) AS similarity
      FROM agent_episodes
      ORDER BY embedding <=> $1::vector
      LIMIT $2`,
      [toPgVector(queryVector), topK],
    );

    return rows.map(rowToEpisode);
  }

  async count(): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM agent_episodes",
    );
    return Number(rows[0]?.count ?? 0);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
